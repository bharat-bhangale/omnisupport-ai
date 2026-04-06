# OmniSupport-AI Architecture Documentation

## Overview

OmniSupport-AI is a multi-tenant AI-powered customer support platform that combines voice agent capabilities, intelligent ticket management, and real-time analytics to provide comprehensive support automation.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────┬─────────────────┬─────────────────────────────────────────┤
│   Web Client    │ Chrome Extension│           Mobile (Future)               │
│  (React/Vite)   │   (React/MV3)   │                                         │
└────────┬────────┴────────┬────────┴─────────────────────────────────────────┘
         │                 │
         │ HTTP/WebSocket  │
         ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                    (Express + Socket.IO + Auth0)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Rate Limiting  │  Authentication  │  Authorization  │  Request Validation  │
└────────┬────────────────┬──────────────────┬────────────────┬───────────────┘
         │                │                  │                │
         ▼                ▼                  ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICES LAYER                                     │
├───────────────────┬───────────────────┬───────────────────┬─────────────────┤
│   Ticket Service  │   Voice Service   │  Analytics Svc    │ Integration Svc │
│   - CRUD ops      │   - Vapi mgmt     │  - Dashboards     │ - Zendesk       │
│   - SLA tracking  │   - Call routing  │  - Reports        │ - Freshdesk     │
│   - AI drafts     │   - Transcription │  - Real-time      │ - Salesforce    │
└─────────┬─────────┴─────────┬─────────┴─────────┬─────────┴────────┬────────┘
          │                   │                   │                  │
          ▼                   ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI LAYER                                        │
├───────────────────┬───────────────────┬───────────────────┬─────────────────┤
│     OpenAI        │    Pinecone       │    ElevenLabs     │    Deepgram     │
│   - GPT-4o        │   - Embeddings    │   - TTS           │   - STT         │
│   - Embeddings    │   - RAG search    │   - Voice clone   │   - Transcribe  │
└───────────────────┴───────────────────┴───────────────────┴─────────────────┘
          │                   │                   │                  │
          ▼                   ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
├───────────────────────────────┬─────────────────────────────────────────────┤
│          MongoDB              │               Redis                          │
│   - Users, Companies          │   - Sessions                                 │
│   - Tickets, Calls            │   - Rate limiting                            │
│   - Knowledge base            │   - Cache                                    │
│   - Analytics                 │   - BullMQ queues                            │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

## Package Structure

```
omnisupport-ai/
├── packages/
│   ├── server/              # Express API server
│   │   ├── src/
│   │   │   ├── config/      # Configuration & env
│   │   │   ├── middleware/  # Express middleware
│   │   │   ├── models/      # Mongoose schemas
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── sockets/     # WebSocket handlers
│   │   │   ├── utils/       # Helper functions
│   │   │   ├── webhooks/    # External webhooks
│   │   │   └── workers/     # Background jobs
│   │   └── tests/           # Test files
│   │
│   ├── client/              # React web application
│   │   ├── src/
│   │   │   ├── api/         # RTK Query API slices
│   │   │   ├── components/  # React components
│   │   │   ├── hooks/       # Custom hooks
│   │   │   ├── pages/       # Page components
│   │   │   └── types/       # TypeScript types
│   │   └── public/          # Static assets
│   │
│   └── extension/           # Chrome extension
│       ├── background.ts    # Service worker
│       ├── content.tsx      # Content script
│       ├── popup.tsx        # Popup UI
│       └── manifest.json    # Extension manifest
│
├── docker-compose.yml       # Container orchestration
├── Dockerfile.server        # Server container
├── Dockerfile.client        # Client container
└── nginx.conf               # Nginx configuration
```

## Core Components

### 1. Authentication & Authorization

- **Provider**: Auth0
- **Method**: JWT tokens with RS256 signing
- **Multi-tenancy**: Company-scoped access via `companyId` in JWT claims
- **RBAC**: Roles include `admin`, `manager`, `agent`

```typescript
// Token structure
interface TokenPayload {
  sub: string;           // Auth0 user ID
  companyId: string;     // Tenant ID
  role: UserRole;        // User role
  permissions: string[]; // Fine-grained permissions
}
```

### 2. Ticket Management

Tickets flow through the following lifecycle:

```
NEW → OPEN → PENDING → ON_HOLD → RESOLVED → CLOSED
                  ↓
              ESCALATED
```

Key features:
- AI-generated response drafts
- SLA tracking with breach notifications
- Multi-channel support (email, chat, phone, social)
- Automatic categorization and prioritization

### 3. Voice Agent System

Integration with Vapi for voice AI:

```
Incoming Call → Vapi Webhook → Voice Agent Config
                    ↓
            Real-time Transcription (Deepgram)
                    ↓
            Intent Detection (GPT-4o)
                    ↓
            Knowledge Base Lookup (Pinecone RAG)
                    ↓
            Response Generation → TTS (ElevenLabs)
                    ↓
            Call Completion → Analytics
```

### 4. Real-time Updates

Socket.IO namespaces:
- `/dashboard` - Live activity feed, call status
- `/tickets` - Ticket updates, assignments
- `/calls` - Call events, transcriptions
- `/analytics` - Real-time metrics

### 5. Background Processing

BullMQ queues:
- `email` - Outbound email processing
- `analytics` - Event aggregation
- `knowledge-sync` - KB document indexing
- `integrations` - External platform sync

## Data Models

### Company (Tenant)
```typescript
interface Company {
  _id: ObjectId;
  name: string;
  settings: {
    subdomain?: string;
    timezone: string;
    defaultLanguage: string;
    slaPolicy: SLAPolicy;
    aiSettings: AISettings;
  };
  subscription: {
    planType: 'starter' | 'professional' | 'enterprise';
    seats: number;
    features: string[];
  };
}
```

### Ticket
```typescript
interface Ticket {
  _id: ObjectId;
  companyId: ObjectId;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  customer: CustomerInfo;
  assignedTo?: ObjectId;
  messages: Message[];
  aiDraft?: AIDraft;
  slaBreachAt?: Date;
  metadata: {
    source: TicketSource;
    sentiment?: number;
    category?: string;
    tags: string[];
  };
}
```

### Call Log
```typescript
interface CallLog {
  _id: ObjectId;
  companyId: ObjectId;
  vapiCallId: string;
  agentId: ObjectId;
  status: CallStatus;
  duration: number;
  transcription: TranscriptSegment[];
  analysis: {
    sentiment: SentimentScore;
    intents: Intent[];
    resolution: ResolutionOutcome;
  };
}
```

## Security Measures

### Input Validation
- Zod schemas for all request bodies
- Mongoose schema validation
- XSS sanitization

### Rate Limiting
```typescript
// Rate limit presets
RATE_LIMITS = {
  standard: { maxRequests: 100, windowSeconds: 60 },
  auth: { maxRequests: 10, windowSeconds: 60 },
  ai: { maxRequests: 20, windowSeconds: 60 },
  webhook: { maxRequests: 1000, windowSeconds: 60 }
}
```

### Webhook Security
- HMAC signature verification for Freshdesk, Vapi
- Timing-safe comparison to prevent timing attacks
- Request timestamp validation

### Data Encryption
- Integration credentials encrypted with AES-256-GCM
- Secure key management via environment variables

## Performance Optimizations

### Database Indexes
```javascript
// Ticket queries
{ companyId: 1, status: 1 }
{ companyId: 1, createdAt: -1 }
{ companyId: 1, assignedTo: 1 }
{ slaBreachAt: 1 }

// Analytics (TTL)
{ timestamp: 1, expireAfterSeconds: 90 * 24 * 60 * 60 }
```

### Caching Strategy
- Redis cache for session data
- RTK Query caching on client
- 30-second polling for dashboard metrics

### Connection Pooling
- MongoDB: 100 connections per process
- Redis: Persistent connection via ioredis

## Deployment

### Docker Compose
```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment Configuration
See `.env.example` for all required variables.

### Health Checks
- Server: `GET /health`
- Client: `GET /health`
- MongoDB: `mongosh --eval "db.adminCommand('ping')"`
- Redis: `redis-cli ping`

## Monitoring & Observability

### Logging
- Winston logger with JSON format
- Log levels: error, warn, info, http, debug
- Request ID tracing

### Metrics (Planned)
- Prometheus metrics endpoint
- Grafana dashboards
- OpenTelemetry tracing

### Error Tracking (Planned)
- Sentry integration
- Error boundary in React

## API Documentation

API documentation is available at `/api-docs` when running the server (Swagger/OpenAPI).

Key endpoints:
- `POST /auth/*` - Authentication
- `GET/POST/PATCH /tickets/*` - Ticket management
- `GET/POST /calls/*` - Call management
- `GET /analytics/*` - Dashboards & reports
- `POST /webhooks/*` - External webhooks

## Development Guidelines

### Code Style
- TypeScript strict mode
- ESLint + Prettier formatting
- Conventional commits

### Testing
- Vitest for unit tests
- Integration tests for critical paths
- 80% coverage target

### Branch Strategy
- `main` - Production
- `develop` - Integration
- `feature/*` - New features
- `fix/*` - Bug fixes
