import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  SERVER_URL: z.string().url(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // MongoDB
  MONGODB_URI: z.string().min(1),

  // Redis (Upstash)
  UPSTASH_REDIS_URL: z.string().min(1),
  UPSTASH_REDIS_TOKEN: z.string().min(1),

  // Auth0
  AUTH0_DOMAIN: z.string().min(1),
  AUTH0_AUDIENCE: z.string().min(1),
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_CLIENT_SECRET: z.string().min(1),
  AUTH0_MGMT_API_TOKEN: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),

  // Pinecone
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_INDEX: z.string().min(1),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),

  // Vapi
  VAPI_API_KEY: z.string().min(1),
  VAPI_WEBHOOK_SECRET: z.string().min(1),
  VAPI_WEBHOOK_URL: z.string().url().optional(),

  // ElevenLabs
  ELEVENLABS_API_KEY: z.string().min(1),

  // Deepgram
  DEEPGRAM_API_KEY: z.string().min(1),

  // AssemblyAI
  ASSEMBLYAI_API_KEY: z.string().min(1),

  // Zendesk
  ZENDESK_SUBDOMAIN: z.string().optional(),
  ZENDESK_EMAIL: z.string().optional(),
  ZENDESK_TOKEN: z.string().optional(),

  // Freshdesk
  FRESHDESK_DOMAIN: z.string().optional(),
  FRESHDESK_API_KEY: z.string().optional(),

  // Salesforce
  SALESFORCE_CLIENT_ID: z.string().optional(),
  SALESFORCE_CLIENT_SECRET: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AWS S3
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),

  // Slack
  SLACK_BOT_TOKEN: z.string().optional(),

  // SendGrid
  SENDGRID_API_KEY: z.string().optional(),

  // Fraud Detection
  IPQUALITYSCORE_API_KEY: z.string().optional(),

  // Encryption
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
