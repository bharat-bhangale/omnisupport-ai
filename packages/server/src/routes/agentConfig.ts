import { Router, Request, Response } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import { Company } from '../models/Company.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import * as vapiAssistantBuilder from '../services/vapiAssistantBuilder.js';

const router = Router();
const childLogger = logger.child({ route: 'agentConfig' });
const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

// ElevenLabs API constants
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Validation schemas
const updateVoiceConfigSchema = z.object({
  agentName: z.string().min(1).max(100).optional(),
  agentGreeting: z.string().min(1).max(500).optional(),
  voiceId: z.string().min(1).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  speakingRate: z.number().min(0.5).max(2.0).optional(),
});

const updateTextConfigSchema = z.object({
  classificationCategories: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  brandVoice: z.string().min(1).max(2000).optional(),
});

const voicePreviewSchema = z.object({
  text: z.string().min(1).max(500),
  voiceId: z.string().min(1),
});

const testCallSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
});

// Helper to verify admin role
function requireAdmin(req: AuthRequest): void {
  if (req.user?.role !== 'admin') {
    throw AppError.forbidden('Admin access required');
  }
}

// Helper to get company
async function getCompany(companyId: string) {
  const company = await Company.findById(companyId);
  if (!company) {
    throw AppError.notFound('Company');
  }
  return company;
}

/**
 * GET /agent-config - Get agent configuration
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    res.json({
      success: true,
      voiceConfig: company.voiceConfig,
      textConfig: company.textConfig,
      vapiAssistantId: company.vapiAssistantId,
    });
  })
);

/**
 * PUT /agent-config/voice - Update voice configuration
 */
router.put(
  '/voice',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const updates = updateVoiceConfigSchema.parse(req.body);

    const company = await getCompany(companyId);

    // Update voice config
    if (updates.agentName !== undefined) company.voiceConfig.agentName = updates.agentName;
    if (updates.agentGreeting !== undefined) company.voiceConfig.agentGreeting = updates.agentGreeting;
    if (updates.voiceId !== undefined) company.voiceConfig.voiceId = updates.voiceId;
    if (updates.stability !== undefined) company.voiceConfig.stability = updates.stability;
    if (updates.similarityBoost !== undefined) company.voiceConfig.similarityBoost = updates.similarityBoost;
    if (updates.speakingRate !== undefined) company.voiceConfig.speakingRate = updates.speakingRate;

    await company.save();

    // Update Vapi assistant
    try {
      await vapiAssistantBuilder.updateAssistant(company);
      childLogger.info({ companyId }, 'Vapi assistant updated with new voice config');
    } catch (error) {
      childLogger.error({ companyId, error }, 'Failed to update Vapi assistant');
      // Don't fail the request, just log the error
    }

    res.json({
      success: true,
      voiceConfig: company.voiceConfig,
      message: 'Voice configuration updated',
    });
  })
);

/**
 * PUT /agent-config/text - Update text configuration
 */
router.put(
  '/text',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const updates = updateTextConfigSchema.parse(req.body);

    const company = await getCompany(companyId);

    // Update text config
    if (updates.classificationCategories !== undefined) {
      company.textConfig.classificationCategories = updates.classificationCategories;
    }
    if (updates.brandVoice !== undefined) {
      company.textConfig.brandVoice = updates.brandVoice;
    }

    await company.save();

    // Update Vapi assistant (text config affects system prompt)
    try {
      await vapiAssistantBuilder.updateAssistant(company);
      childLogger.info({ companyId }, 'Vapi assistant updated with new text config');
    } catch (error) {
      childLogger.error({ companyId, error }, 'Failed to update Vapi assistant');
    }

    res.json({
      success: true,
      textConfig: company.textConfig,
      message: 'Text configuration updated',
    });
  })
);

/**
 * POST /agent-config/voice/preview - Preview voice with ElevenLabs TTS
 */
router.post(
  '/voice/preview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const { text, voiceId } = voicePreviewSchema.parse(req.body);

    childLogger.info({ voiceId, textLength: text.length }, 'Generating voice preview');

    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      childLogger.error({ voiceId, error, status: response.status }, 'ElevenLabs TTS failed');
      throw AppError.externalService('ElevenLabs', new Error(error));
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    res.json({
      success: true,
      audio: base64Audio,
      contentType: 'audio/mpeg',
    });
  })
);

/**
 * POST /agent-config/test-call - Create test outbound call
 */
router.post(
  '/test-call',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const { phoneNumber } = testCallSchema.parse(req.body);

    const company = await getCompany(companyId);

    if (!company.vapiAssistantId) {
      // Create assistant if it doesn't exist
      const assistantId = await vapiAssistantBuilder.createAssistant(company);
      company.vapiAssistantId = assistantId;
      await company.save();
    }

    childLogger.info({ companyId, phoneNumber }, 'Creating test call');

    // Create outbound call via Twilio
    // The call will connect to Vapi for handling
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: env.TWILIO_PHONE_NUMBER,
      url: `${env.SERVER_URL}/webhooks/twilio/connect?assistantId=${company.vapiAssistantId}`,
      statusCallback: `${env.SERVER_URL}/webhooks/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    childLogger.info({ companyId, phoneNumber, callSid: call.sid }, 'Test call initiated');

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status,
      message: 'Test call initiated',
    });
  })
);

/**
 * GET /agent-config/voices - List available ElevenLabs voices
 */
router.get(
  '/voices',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    childLogger.info({ companyId, tier: company.tier }, 'Fetching available voices');

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        'xi-api-key': env.ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      childLogger.error({ error, status: response.status }, 'Failed to fetch ElevenLabs voices');
      throw AppError.externalService('ElevenLabs', new Error(error));
    }

    const data = await response.json() as {
      voices: Array<{
        voice_id: string;
        name: string;
        category: string;
        labels: Record<string, string>;
        preview_url: string;
      }>;
    };

    // Filter voices based on plan tier
    const voiceLimits: Record<string, number> = {
      starter: 10,
      growth: 25,
      enterprise: 999,
    };

    const limit = voiceLimits[company.tier] || 10;

    const voices = data.voices.slice(0, limit).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      category: voice.category,
      accent: voice.labels?.accent,
      gender: voice.labels?.gender,
      age: voice.labels?.age,
      description: voice.labels?.description,
      previewUrl: voice.preview_url,
    }));

    res.json({
      success: true,
      voices,
      total: voices.length,
      tier: company.tier,
    });
  })
);

export default router;
