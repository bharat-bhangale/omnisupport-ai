// Redis TTLs (in seconds)
export const REDIS_TTL = {
  LIVE_CALL_SESSION: 14400,    // 4 hours
  CUSTOMER_CARD: 3600,         // 1 hour
  ANALYTICS_CACHE: 86400,      // 24 hours
  RATE_LIMIT: 60,              // 1 minute
  LOCK: 30,                    // 30 seconds
} as const;

// Redis key prefixes
export const REDIS_KEYS = {
  SESSION: 'session',
  CUSTOMER_360: 'customer360',
  ANALYTICS: 'analytics',
  RATE_LIMIT: 'ratelimit',
  LOCK: 'lock',
} as const;

// BullMQ queue names
export const QUEUES = {
  CLASSIFICATION: 'classification',
  SUMMARY: 'summary',
  QA: 'qa',
  KB_INDEX: 'kb-index',
  LEARNING: 'learning',
  SLA_MONITOR: 'sla-monitor',
  WORKFLOW: 'workflow',
  RESPONSE: 'response',
  SENTIMENT: 'sentiment',
} as const;

// OpenAI configuration
export const OPENAI_CONFIG = {
  MODEL: 'gpt-4o',
  EMBEDDING_MODEL: 'text-embedding-3-small',
  EMBEDDING_DIMENSIONS: 1536,
  TEMPERATURE: {
    CLASSIFICATION: 0,
    QA: 0,
    GENERATION: 0.7,
  },
  MAX_TOKENS: {
    CLASSIFICATION: 256,
    RESPONSE: 1024,
    SUMMARY: 512,
  },
} as const;

// Pinecone configuration
export const PINECONE_CONFIG = {
  DIMENSIONS: 1536,
  METRIC: 'cosine',
  TOP_K: 5,
} as const;

// LangChain text splitting
export const TEXT_SPLITTER_CONFIG = {
  CHUNK_SIZE: 512,
  CHUNK_OVERLAP: 50,
} as const;

// Conversation limits
export const CONVERSATION_LIMITS = {
  MAX_TURNS_BEFORE_TRUNCATE: 80,
  KEEP_FIRST_TURNS: 5,
  KEEP_LAST_TURNS: 40,
} as const;

// Vapi webhook timeout
export const VAPI_WEBHOOK_TIMEOUT_MS = 1500;

// Supported languages
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru',
  'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'vi', 'th', 'id',
  'ms', 'fil', 'sv', 'no', 'da', 'fi', 'cs', 'ro', 'hu',
  'el', 'he',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// Roles for RBAC
export const ROLES = {
  AGENT: 'agent',
  MANAGER: 'manager',
  ADMIN: 'admin',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Channels
export const CHANNELS = {
  VOICE: 'voice',
  TEXT: 'text',
} as const;

export type Channel = typeof CHANNELS[keyof typeof CHANNELS];

// Sentiment labels
export const SENTIMENT_LABELS = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
} as const;

export type SentimentLabel = typeof SENTIMENT_LABELS[keyof typeof SENTIMENT_LABELS];

// Escalation reasons
export const ESCALATION_REASONS = [
  'customer_request',
  'high_frustration',
  'complex_issue',
  'policy_exception',
  'technical_limitation',
  'vip_customer',
  'legal_compliance',
] as const;

export type EscalationReason = typeof ESCALATION_REASONS[number];
