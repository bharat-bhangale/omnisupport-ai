import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { ICompany, VoiceConfig } from '../models/Company.js';

const childLogger = logger.child({ service: 'vapiAssistantBuilder' });

// Vapi API constants
const VAPI_API_BASE = 'https://api.vapi.ai';

export interface VapiAssistantConfig {
  name: string;
  model: {
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
    functions?: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
  };
  voice: {
    provider: string;
    voiceId: string;
    stability: number;
    similarityBoost: number;
    speed: number;
  };
  firstMessage: string;
  endCallMessage?: string;
  transcriber: {
    provider: string;
    model: string;
    language: string;
  };
  serverUrl?: string;
  serverUrlSecret?: string;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  backgroundSound?: string;
  backchannelingEnabled?: boolean;
  recordingEnabled?: boolean;
}

/**
 * Build the Vapi assistant configuration from company settings
 */
export function buildAssistantConfig(company: ICompany): VapiAssistantConfig {
  const voiceConfig = company.voiceConfig;

  const systemPrompt = buildSystemPrompt(company);

  return {
    name: `${company.name} - ${voiceConfig.agentName}`,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      systemPrompt,
      functions: buildFunctions(),
    },
    voice: {
      provider: 'elevenlabs',
      voiceId: voiceConfig.voiceId,
      stability: voiceConfig.stability,
      similarityBoost: voiceConfig.similarityBoost,
      speed: voiceConfig.speakingRate,
    },
    firstMessage: voiceConfig.agentGreeting,
    endCallMessage: "Thank you for calling. Have a great day!",
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    serverUrl: `${env.SERVER_URL}/webhooks/vapi`,
    serverUrlSecret: env.VAPI_WEBHOOK_SECRET,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 1800, // 30 minutes
    backgroundSound: 'off',
    backchannelingEnabled: true,
    recordingEnabled: true,
  };
}

/**
 * Build the system prompt for the assistant
 */
function buildSystemPrompt(company: ICompany): string {
  const { textConfig, voiceConfig } = company;

  return `You are ${voiceConfig.agentName}, an AI customer support agent for ${company.name}.

## Your Role
You help customers with their inquiries and issues. You should be ${textConfig.brandVoice}

## Available Categories
When classifying customer issues, use these categories:
${textConfig.classificationCategories.map((c) => `- ${c}`).join('\n')}

## Guidelines
1. Always greet the customer warmly and introduce yourself
2. Listen carefully to understand their issue
3. Ask clarifying questions when needed
4. Provide accurate, helpful information
5. If you cannot resolve an issue, offer to escalate to a human agent
6. Always confirm the customer's satisfaction before ending the call
7. Be empathetic and patient, especially with frustrated customers

## Tools Available
You have access to tools for:
- Looking up customer information
- Searching the knowledge base
- Creating support tickets
- Checking order status
- Scheduling callbacks

Use these tools proactively to assist customers efficiently.`;
}

/**
 * Build the function definitions for tool calling
 */
function buildFunctions(): VapiAssistantConfig['model']['functions'] {
  return [
    {
      name: 'lookupCustomer',
      description: 'Look up customer information by phone number or email',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Customer phone number' },
          email: { type: 'string', description: 'Customer email address' },
        },
      },
    },
    {
      name: 'searchKnowledgeBase',
      description: 'Search the knowledge base for information about a topic',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'createTicket',
      description: 'Create a support ticket for the customer',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Ticket subject' },
          description: { type: 'string', description: 'Detailed description of the issue' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          category: { type: 'string', description: 'Issue category' },
        },
        required: ['subject', 'description'],
      },
    },
    {
      name: 'escalateToHuman',
      description: 'Transfer the call to a human agent',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for escalation' },
          priority: { type: 'string', enum: ['normal', 'urgent'] },
        },
        required: ['reason'],
      },
    },
    {
      name: 'scheduleCallback',
      description: 'Schedule a callback for the customer',
      parameters: {
        type: 'object',
        properties: {
          preferredTime: { type: 'string', description: 'Preferred callback time' },
          reason: { type: 'string', description: 'Reason for callback' },
        },
        required: ['reason'],
      },
    },
  ];
}

/**
 * Create a new Vapi assistant
 */
export async function createAssistant(company: ICompany): Promise<string> {
  const config = buildAssistantConfig(company);

  childLogger.info({ companyId: company._id, name: config.name }, 'Creating Vapi assistant');

  const response = await fetch(`${VAPI_API_BASE}/assistant`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.text();
    childLogger.error({ companyId: company._id, error, status: response.status }, 'Failed to create Vapi assistant');
    throw new Error(`Failed to create Vapi assistant: ${error}`);
  }

  const data = await response.json() as { id: string };
  
  childLogger.info({ companyId: company._id, assistantId: data.id }, 'Vapi assistant created');
  
  return data.id;
}

/**
 * Update an existing Vapi assistant
 */
export async function updateAssistant(company: ICompany): Promise<void> {
  if (!company.vapiAssistantId) {
    childLogger.warn({ companyId: company._id }, 'No Vapi assistant ID found, creating new assistant');
    const assistantId = await createAssistant(company);
    company.vapiAssistantId = assistantId;
    await company.save();
    return;
  }

  const config = buildAssistantConfig(company);

  childLogger.info(
    { companyId: company._id, assistantId: company.vapiAssistantId },
    'Updating Vapi assistant'
  );

  const response = await fetch(`${VAPI_API_BASE}/assistant/${company.vapiAssistantId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.text();
    childLogger.error(
      { companyId: company._id, assistantId: company.vapiAssistantId, error, status: response.status },
      'Failed to update Vapi assistant'
    );
    throw new Error(`Failed to update Vapi assistant: ${error}`);
  }

  childLogger.info({ companyId: company._id, assistantId: company.vapiAssistantId }, 'Vapi assistant updated');
}

/**
 * Delete a Vapi assistant
 */
export async function deleteAssistant(assistantId: string): Promise<void> {
  childLogger.info({ assistantId }, 'Deleting Vapi assistant');

  const response = await fetch(`${VAPI_API_BASE}/assistant/${assistantId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${env.VAPI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    childLogger.error({ assistantId, error, status: response.status }, 'Failed to delete Vapi assistant');
    throw new Error(`Failed to delete Vapi assistant: ${error}`);
  }

  childLogger.info({ assistantId }, 'Vapi assistant deleted');
}
