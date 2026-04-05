# OmniSupport-AI

A multi-tenant AI-powered customer support platform with voice agents, intelligent ticket management, and real-time analytics.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)

## Features

- 🤖 **AI-Powered Responses** - GPT-4o generates contextual draft responses
- 📞 **Voice Agents** - Automated phone support with real-time transcription
- 🎫 **Ticket Management** - Multi-channel support with SLA tracking
- 📊 **Real-time Analytics** - Live dashboards and performance metrics
- 🔗 **Integrations** - Zendesk, Freshdesk, Salesforce, Slack
- 🌍 **Multi-tenant** - Company isolation with role-based access control

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, Redux Toolkit, Tailwind CSS, Socket.IO |
| **Backend** | Node.js 22, Express 5, TypeScript, Socket.IO |
| **Database** | MongoDB (Mongoose), Redis (ioredis) |
| **AI/Voice** | OpenAI GPT-4o, Pinecone, Vapi, ElevenLabs, Deepgram |
| **Auth** | Auth0 (JWT) |
| **Queue** | BullMQ |
| **DevOps** | Docker, GitHub Actions |

## Quick Start

### Prerequisites

- Node.js 22+
- MongoDB 7+
- Redis 7+
- npm 10+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/omnisupport-ai.git
   cd omnisupport-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Start backend
   npm run dev:server

   # Terminal 2: Start frontend
   npm run dev:client
   ```

5. **Open in browser**
   - Client: http://localhost:5173
   - Server: http://localhost:3000

### Docker Setup

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Structure

```
omnisupport-ai/
├── packages/
│   ├── server/          # Express API server
│   ├── client/          # React web application
│   └── extension/       # Chrome extension
├── docker-compose.yml   # Container orchestration
├── ARCHITECTURE.md      # System design docs
└── CONTRIBUTING.md      # Contribution guide
```

## Available Scripts

### Root Level
```bash
npm run dev:server     # Start server in development
npm run dev:client     # Start client in development
npm run build:server   # Build server for production
npm run build:client   # Build client for production
npm run lint           # Lint all packages
npm run typecheck      # Type check all packages
```

### Server Package
```bash
cd packages/server
npm run dev            # Start with hot reload
npm run build          # Compile TypeScript
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage
```

### Client Package
```bash
cd packages/client
npm run dev            # Start Vite dev server
npm run build          # Build for production
npm run preview        # Preview production build
```

### Extension Package
```bash
cd packages/extension
npm run build          # Build extension
npm run watch          # Build with watch mode
```

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `UPSTASH_REDIS_URL` | Redis connection URL |
| `AUTH0_DOMAIN` | Auth0 tenant domain |
| `AUTH0_AUDIENCE` | Auth0 API audience |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINECONE_API_KEY` | Pinecone API key |

See `.env.example` for the complete list.

## API Documentation

API documentation is available at `/api-docs` when running the server.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User authentication |
| GET | `/tickets` | List tickets |
| POST | `/tickets` | Create ticket |
| GET | `/calls` | List call logs |
| GET | `/analytics/dashboard` | Dashboard metrics |
| POST | `/webhooks/freshdesk` | Freshdesk webhook |

## Testing

```bash
# Run all tests
npm run test --workspaces

# Run with coverage
npm run test:coverage -w packages/server

# Run specific test file
npm run test -- packages/server/src/middleware/rateLimit.test.ts
```

## Deployment

### Production Build

```bash
# Build all packages
npm run build:server
npm run build:client

# Or using Docker
docker-compose -f docker-compose.yml build
```

### Environment Variables

Set these in your production environment:

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
UPSTASH_REDIS_URL=redis://...
# ... other variables
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design documentation.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/tooling changes

## Security

- Report security vulnerabilities to security@example.com
- See [SECURITY.md](./SECURITY.md) for our security policy

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- 📖 [Documentation](./ARCHITECTURE.md)
- 🐛 [Issue Tracker](https://github.com/your-org/omnisupport-ai/issues)
- 💬 [Discussions](https://github.com/your-org/omnisupport-ai/discussions)
