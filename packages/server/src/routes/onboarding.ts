// ============================================================================
// ONBOARDING API ROUTES
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { Company } from '../models/Company.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getIO } from '../sockets/index.js';

const router = Router();

// ============================================================================
// ENCRYPTION HELPERS
// ============================================================================

const ENCRYPTION_KEY = crypto.scryptSync(env.INTEGRATION_ENCRYPTION_KEY, 'salt', 32);
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encryptedText] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const companySchema = z.object({
  name: z.string().min(2).max(100),
  industry: z.enum([
    'saas', 'ecommerce', 'healthcare', 'finance', 'education',
    'travel', 'retail', 'technology', 'media', 'other'
  ]),
  primaryLanguage: z.string().length(2),
  timezone: z.string().min(1),
});

const voiceConnectSchema = z.object({
  twilioAccountSid: z.string().startsWith('AC'),
  twilioAuthToken: z.string().min(32),
  twilioPhone: z.string().regex(/^\+[1-9]\d{1,14}$/),
});

const textConnectSchema = z.object({
  platform: z.enum(['zendesk', 'freshdesk']),
  subdomain: z.string().min(1),
  apiKey: z.string().min(1),
  email: z.string().email().optional(),
});

const configSchema = z.object({
  agentName: z.string().min(1).max(50).optional(),
  agentGreeting: z.string().max(500).optional(),
  voiceId: z.string().optional(),
  classificationCategories: z.array(z.string()).optional(),
  brandVoice: z.string().max(1000).optional(),
});

const testCallSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
});

// ============================================================================
// POST /onboarding/company — Create Company
// ============================================================================

router.post('/company', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const data = companySchema.parse(req.body);

    // Check if user already has a company
    const existingCompany = await Company.findOne({ _id: authReq.user.companyId });
    if (existingCompany && existingCompany.onboardingComplete) {
      throw new AppError('Company already exists and is onboarded', 400);
    }

    let company;
    if (existingCompany) {
      // Update existing company
      company = await Company.findByIdAndUpdate(
        authReq.user.companyId,
        {
          name: data.name,
          industry: data.industry,
          primaryLanguage: data.primaryLanguage,
          timezone: data.timezone,
        },
        { new: true }
      );
    } else {
      // Create new company
      company = await Company.create({
        _id: authReq.user.companyId,
        name: data.name,
        industry: data.industry,
        primaryLanguage: data.primaryLanguage,
        timezone: data.timezone,
        onboardingComplete: false,
      });
    }

    logger.info({ companyId: company?._id }, 'Company created/updated via onboarding');

    res.status(201).json({
      companyId: company?._id,
      message: 'Company created',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /onboarding/voice/connect — Connect Twilio
// ============================================================================

router.post('/voice/connect', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const data = voiceConnectSchema.parse(req.body);

    // Validate Twilio credentials by making API call
    const twilioAuthHeader = Buffer.from(`${data.twilioAccountSid}:${data.twilioAuthToken}`).toString('base64');
    
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${data.twilioAccountSid}/IncomingPhoneNumbers.json`,
      {
        headers: {
          'Authorization': `Basic ${twilioAuthHeader}`,
        },
      }
    );

    if (!twilioResponse.ok) {
      if (twilioResponse.status === 401) {
        throw new AppError('Invalid Twilio credentials', 401);
      }
      throw new AppError('Failed to validate Twilio account', 400);
    }

    const phoneNumbers = await twilioResponse.json();
    
    // Verify the phone number belongs to this account
    const matchingNumber = phoneNumbers.incoming_phone_numbers?.find(
      (n: { phone_number: string }) => n.phone_number === data.twilioPhone
    );

    if (!matchingNumber) {
      throw new AppError('Phone number not found in Twilio account', 400);
    }

    // Encrypt and store credentials
    const encryptedSid = encrypt(data.twilioAccountSid);
    const encryptedToken = encrypt(data.twilioAuthToken);

    await Company.findByIdAndUpdate(authReq.user.companyId, {
      'voiceConfig.twilioAccountSid': encryptedSid,
      'voiceConfig.twilioAuthToken': encryptedToken,
      'voiceConfig.twilioPhoneNumber': data.twilioPhone,
      'voiceConfig.enabled': true,
    });

    logger.info({ companyId: authReq.user.companyId }, 'Twilio connected');

    res.json({
      connected: true,
      phoneNumber: data.twilioPhone,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /onboarding/text/connect — Connect Zendesk/Freshdesk
// ============================================================================

router.post('/text/connect', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const data = textConnectSchema.parse(req.body);

    let validationUrl: string;
    let headers: Record<string, string>;

    if (data.platform === 'zendesk') {
      validationUrl = `https://${data.subdomain}.zendesk.com/api/v2/tickets.json?per_page=1`;
      const authString = `${data.email}/token:${data.apiKey}`;
      headers = {
        'Authorization': `Basic ${Buffer.from(authString).toString('base64')}`,
        'Content-Type': 'application/json',
      };
    } else {
      // Freshdesk
      validationUrl = `https://${data.subdomain}.freshdesk.com/api/v2/tickets?per_page=1`;
      headers = {
        'Authorization': `Basic ${Buffer.from(`${data.apiKey}:X`).toString('base64')}`,
        'Content-Type': 'application/json',
      };
    }

    // Validate credentials
    const response = await fetch(validationUrl, { headers });

    if (!response.ok) {
      if (response.status === 401) {
        throw new AppError(`Invalid ${data.platform} credentials`, 401);
      }
      throw new AppError(`Failed to connect to ${data.platform}`, 400);
    }

    // Encrypt and store credentials
    const encryptedApiKey = encrypt(data.apiKey);

    const integrationConfig = {
      subdomain: data.subdomain,
      apiKey: encryptedApiKey,
      email: data.email,
      enabled: true,
      connectedAt: new Date(),
    };

    await Company.findByIdAndUpdate(authReq.user.companyId, {
      [`integrations.${data.platform}`]: integrationConfig,
      'textConfig.enabled': true,
      'textConfig.platform': data.platform,
    });

    logger.info({ companyId: authReq.user.companyId, platform: data.platform }, 'Helpdesk connected');

    res.json({
      connected: true,
      platform: data.platform,
      subdomain: data.subdomain,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /onboarding/voice/create-assistant — Create Vapi Assistant
// ============================================================================

router.post('/voice/create-assistant', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const company = await Company.findById(authReq.user.companyId);

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    if (!company.voiceConfig?.twilioPhoneNumber) {
      throw new AppError('Twilio not connected. Connect voice channel first.', 400);
    }

    // Build assistant configuration
    const assistantConfig = buildAssistantConfig(company);

    // Create Vapi assistant
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assistantConfig),
    });

    if (!vapiResponse.ok) {
      const error = await vapiResponse.text();
      logger.error({ error }, 'Failed to create Vapi assistant');
      throw new AppError('Failed to create voice assistant', 500);
    }

    const assistant = await vapiResponse.json();

    // Store assistant ID
    await Company.findByIdAndUpdate(authReq.user.companyId, {
      'voiceConfig.vapiAssistantId': assistant.id,
    });

    logger.info({ companyId: authReq.user.companyId, assistantId: assistant.id }, 'Vapi assistant created');

    res.json({
      created: true,
      assistantId: assistant.id,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PATCH /onboarding/config — Update AI Configuration
// ============================================================================

router.patch('/config', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const data = configSchema.parse(req.body);

    const updateFields: Record<string, unknown> = {};

    if (data.agentName) {
      updateFields['voiceConfig.agentName'] = data.agentName;
    }
    if (data.agentGreeting) {
      updateFields['voiceConfig.greeting'] = data.agentGreeting;
    }
    if (data.voiceId) {
      updateFields['voiceConfig.voiceId'] = data.voiceId;
    }
    if (data.classificationCategories) {
      updateFields['textConfig.classificationCategories'] = data.classificationCategories;
    }
    if (data.brandVoice) {
      updateFields['textConfig.brandVoice'] = data.brandVoice;
    }

    await Company.findByIdAndUpdate(authReq.user.companyId, updateFields);

    logger.info({ companyId: authReq.user.companyId }, 'AI configuration updated');

    res.json({
      updated: true,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /onboarding/complete — Mark Onboarding Complete
// ============================================================================

router.post('/complete', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;

    await Company.findByIdAndUpdate(authReq.user.companyId, {
      onboardingComplete: true,
      onboardingCompletedAt: new Date(),
    });

    logger.info({ companyId: authReq.user.companyId }, 'Onboarding completed');

    res.json({
      complete: true,
      message: 'Welcome to OmniSupport AI!',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// POST /onboarding/test-call — Make Test Outbound Call
// ============================================================================

router.post('/test-call', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const data = testCallSchema.parse(req.body);

    const company = await Company.findById(authReq.user.companyId);
    if (!company) {
      throw new AppError('Company not found', 404);
    }

    if (!company.voiceConfig?.twilioAccountSid || !company.voiceConfig?.twilioAuthToken) {
      throw new AppError('Twilio not connected', 400);
    }

    // Decrypt credentials
    const accountSid = decrypt(company.voiceConfig.twilioAccountSid);
    const authToken = decrypt(company.voiceConfig.twilioAuthToken);

    // Make outbound test call via Twilio
    const twilioAuthHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const twiml = `
      <Response>
        <Say voice="Polly.Amy">
          Hello! This is a test call from OmniSupport AI. 
          Your voice assistant is configured and ready to receive calls. 
          Thank you for testing!
        </Say>
        <Pause length="1"/>
        <Say voice="Polly.Amy">Goodbye!</Say>
      </Response>
    `;

    const callResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${twilioAuthHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: data.phoneNumber,
          From: company.voiceConfig.twilioPhoneNumber!,
          Twiml: twiml,
        }),
      }
    );

    if (!callResponse.ok) {
      const error = await callResponse.text();
      logger.error({ error }, 'Failed to initiate test call');
      throw new AppError('Failed to initiate test call', 500);
    }

    const call = await callResponse.json();

    // Set up listener for call detection
    const io = getIO();
    const companyRoom = `company:${authReq.user.companyId}`;

    // Emit test call initiated event
    io.to(companyRoom).emit('test:callInitiated', {
      callSid: call.sid,
      to: data.phoneNumber,
    });

    // The actual 'test:callDetected' event will be emitted from the call webhook
    // when the call is answered

    logger.info({ companyId: authReq.user.companyId, callSid: call.sid }, 'Test call initiated');

    res.json({
      initiated: true,
      callSid: call.sid,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// GET /onboarding/status — Get Onboarding Status
// ============================================================================

router.get('/status', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const company = await Company.findById(authReq.user.companyId);

    if (!company) {
      return res.json({
        step: 1,
        complete: false,
        voiceConnected: false,
        textConnected: false,
      });
    }

    const voiceConnected = !!(company.voiceConfig?.twilioPhoneNumber);
    const textConnected = !!(company.integrations?.zendesk?.enabled || company.integrations?.freshdesk?.enabled);
    const hasKnowledge = !!(company.kbDocumentCount && company.kbDocumentCount > 0);
    const hasConfig = !!(company.voiceConfig?.agentName || company.textConfig?.brandVoice);

    // Determine current step
    let step = 1;
    if (company.name) step = 2;
    if (voiceConnected || textConnected) step = 3;
    if (hasKnowledge) step = 4;
    if (hasConfig) step = 5;
    if (company.onboardingComplete) step = 6;

    res.json({
      step,
      complete: company.onboardingComplete || false,
      voiceConnected,
      textConnected,
      textPlatform: textConnected 
        ? (company.integrations?.zendesk?.enabled ? 'zendesk' : 'freshdesk')
        : null,
      hasKnowledge,
      hasConfig,
      company: {
        name: company.name,
        industry: company.industry,
        primaryLanguage: company.primaryLanguage,
        timezone: company.timezone,
        voicePhone: company.voiceConfig?.twilioPhoneNumber,
        agentName: company.voiceConfig?.agentName,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// HELPER: Build Vapi Assistant Config
// ============================================================================

function buildAssistantConfig(company: InstanceType<typeof Company>) {
  const agentName = company.voiceConfig?.agentName || 'Support Assistant';
  const greeting = company.voiceConfig?.greeting || 
    `Hello, thank you for calling ${company.name}. How can I help you today?`;
  
  return {
    name: `${company.name} - ${agentName}`,
    voice: {
      provider: '11labs',
      voiceId: company.voiceConfig?.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Sarah voice
    },
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      systemPrompt: `You are ${agentName}, an AI customer support assistant for ${company.name}. 
Your primary goal is to help customers with their inquiries efficiently and professionally.

Guidelines:
- Be friendly, professional, and empathetic
- Ask clarifying questions when needed
- Use the available tools to look up customer information and search the knowledge base
- If you cannot resolve the issue, offer to escalate to a human agent
- Keep responses concise but helpful
- Speak naturally as if in a phone conversation

Company industry: ${company.industry}
Primary language: ${company.primaryLanguage}
`,
    },
    firstMessage: greeting,
    serverUrl: `${env.VAPI_WEBHOOK_URL || env.SERVER_URL}/webhooks/vapi`,
    serverUrlSecret: env.VAPI_WEBHOOK_SECRET,
    transcriber: {
      provider: 'deepgram',
      language: company.primaryLanguage || 'en',
    },
    endCallFunctionEnabled: true,
    recordingEnabled: true,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 1800,
    backgroundSound: 'off',
    backchannelingEnabled: true,
    metadata: {
      companyId: company._id.toString(),
      industry: company.industry,
    },
  };
}

export default router;
