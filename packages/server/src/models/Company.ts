import mongoose, { Schema, Document, Model } from 'mongoose';

export interface VoiceConfig {
  agentName: string;
  agentGreeting: string;
  voiceId: string;
  stability: number;
  similarityBoost: number;
  speakingRate: number;
}

export interface TextConfig {
  classificationCategories: string[];
  brandVoice: string;
  supportedLanguages: string[];
  autoDetect: boolean;
}

export interface QARubricDimension {
  minPassScore: number;
  weight: number;
}

export interface QARubric {
  intentUnderstanding: QARubricDimension;
  responseAccuracy: QARubricDimension;
  resolutionSuccess: QARubricDimension;
  escalationCorrectness: QARubricDimension;
  customerExperience: QARubricDimension;
}

export interface ICompany extends Document {
  name: string;
  slug: string;
  tier: 'starter' | 'growth' | 'enterprise';
  vapiAssistantId?: string;
  voiceConfig: VoiceConfig;
  textConfig: TextConfig;
  integrations: {
    zendesk?: {
      subdomain: string;
      email: string;
      tokenEncrypted: string;
    };
    freshdesk?: {
      domain: string;
      apiKeyEncrypted: string;
    };
    salesforce?: {
      instanceUrl: string;
      clientId: string;
      clientSecretEncrypted: string;
      accessTokenEncrypted?: string;
      refreshTokenEncrypted?: string;
    };
    hubspot?: {
      apiKeyEncrypted: string;
    };
    slack?: {
      webhookUrl: string;
      channel?: string;
    };
    twilio?: {
      phoneNumber: string;
    };
  };
  limits: {
    monthlyMinutes: number;
    monthlyTickets: number;
    kbDocuments: number;
    seats: number;
  };
  usage: {
    currentMonthMinutes: number;
    currentMonthTickets: number;
    usageResetAt: Date;
  };
  settings: {
    timezone: string;
    businessHours: {
      enabled: boolean;
      schedule: {
        day: number;
        start: string;
        end: string;
      }[];
    };
    escalationEmail?: string;
    slaEnabled: boolean;
  };
  qaRubric?: QARubric;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const voiceConfigSchema = new Schema<VoiceConfig>(
  {
    agentName: {
      type: String,
      default: 'Support Agent',
    },
    agentGreeting: {
      type: String,
      default: 'Hello! Thanks for calling. How can I help you today?',
    },
    voiceId: {
      type: String,
      default: '21m00Tcm4TlvDq8ikWAM', // Default ElevenLabs voice (Rachel)
    },
    stability: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1,
    },
    similarityBoost: {
      type: Number,
      default: 0.75,
      min: 0,
      max: 1,
    },
    speakingRate: {
      type: Number,
      default: 1.0,
      min: 0.5,
      max: 2.0,
    },
  },
  { _id: false }
);

const textConfigSchema = new Schema<TextConfig>(
  {
    classificationCategories: {
      type: [String],
      default: [
        'Technical Support',
        'Billing',
        'Account',
        'Feature Request',
        'Bug Report',
        'General Inquiry',
      ],
    },
    brandVoice: {
      type: String,
      default: 'Professional, friendly, and helpful. Use clear language and be empathetic to customer concerns.',
    },
    supportedLanguages: {
      type: [String],
      default: ['en'],
    },
    autoDetect: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const companySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    tier: {
      type: String,
      enum: ['starter', 'growth', 'enterprise'],
      default: 'starter',
    },
    vapiAssistantId: {
      type: String,
      sparse: true,
    },
    voiceConfig: {
      type: voiceConfigSchema,
      default: () => ({}),
    },
    textConfig: {
      type: textConfigSchema,
      default: () => ({}),
    },
    integrations: {
      zendesk: {
        subdomain: String,
        email: String,
        tokenEncrypted: String,
      },
      freshdesk: {
        domain: String,
        apiKeyEncrypted: String,
      },
      salesforce: {
        instanceUrl: String,
        clientId: String,
        clientSecretEncrypted: String,
        accessTokenEncrypted: String,
        refreshTokenEncrypted: String,
      },
      hubspot: {
        apiKeyEncrypted: String,
      },
      slack: {
        webhookUrl: String,
        channel: String,
      },
      twilio: {
        phoneNumber: String,
      },
    },
    limits: {
      monthlyMinutes: {
        type: Number,
        default: 100,
      },
      monthlyTickets: {
        type: Number,
        default: 500,
      },
      kbDocuments: {
        type: Number,
        default: 50,
      },
      seats: {
        type: Number,
        default: 5,
      },
    },
    usage: {
      currentMonthMinutes: {
        type: Number,
        default: 0,
      },
      currentMonthTickets: {
        type: Number,
        default: 0,
      },
      usageResetAt: {
        type: Date,
        default: () => {
          const now = new Date();
          return new Date(now.getFullYear(), now.getMonth() + 1, 1);
        },
      },
    },
    settings: {
      timezone: {
        type: String,
        default: 'UTC',
      },
      businessHours: {
        enabled: {
          type: Boolean,
          default: false,
        },
        schedule: [
          {
            day: Number,
            start: String,
            end: String,
          },
        ],
      },
      escalationEmail: String,
      slaEnabled: {
        type: Boolean,
        default: true,
      },
    },
    qaRubric: {
      intentUnderstanding: {
        minPassScore: { type: Number, default: 6 },
        weight: { type: Number, default: 0.20 },
      },
      responseAccuracy: {
        minPassScore: { type: Number, default: 7 },
        weight: { type: Number, default: 0.25 },
      },
      resolutionSuccess: {
        minPassScore: { type: Number, default: 6 },
        weight: { type: Number, default: 0.25 },
      },
      escalationCorrectness: {
        minPassScore: { type: Number, default: 7 },
        weight: { type: Number, default: 0.15 },
      },
      customerExperience: {
        minPassScore: { type: Number, default: 6 },
        weight: { type: Number, default: 0.15 },
      },
    },
    billing: {
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      plan: {
        type: String,
        enum: ['starter', 'growth', 'enterprise'],
        default: 'starter',
      },
      status: {
        type: String,
        enum: ['active', 'past_due', 'canceled', 'trialing'],
        default: 'active',
      },
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },
    },
    security: {
      twoFactorRequired: {
        type: Boolean,
        default: false,
      },
      sessionTimeoutMinutes: {
        type: Number,
        default: 480, // 8 hours
      },
      dataRetentionDays: {
        type: Number,
        default: 90,
      },
      ipWhitelist: {
        type: [String],
        default: [],
      },
    },
    apiKeys: {
      publicKey: String,
      secretKeyHash: String,
      webhookSecret: String,
      lastRotatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    industry: String,
    primaryLanguage: {
      type: String,
      default: 'en',
    },
    logoUrl: String,
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
companySchema.index({ slug: 1 }, { unique: true });
companySchema.index({ active: 1 });
companySchema.index({ tier: 1 });
companySchema.index({ 'billing.stripeCustomerId': 1 });

export const Company: Model<ICompany> = mongoose.model<ICompany>('Company', companySchema);
