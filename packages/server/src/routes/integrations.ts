import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Company } from '../models/Company.js';
import { encryptCredential, decryptCredential, maskCredential } from '../services/credentialCrypto.js';
import { getOrchestrator, clearOrchestratorCache } from '../integrations/IntegrationOrchestrator.js';
import { ZendeskAdapter } from '../integrations/adapters/ZendeskAdapter.js';
import { FreshdeskAdapter } from '../integrations/adapters/FreshdeskAdapter.js';
import { SalesforceAdapter } from '../integrations/adapters/SalesforceAdapter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';

const router = Router();
const childLogger = logger.child({ route: 'integrations' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Available integrations metadata
const INTEGRATIONS_METADATA = {
  zendesk: {
    name: 'zendesk',
    displayName: 'Zendesk',
    category: 'helpdesk',
    description: 'Sync tickets, contacts, and call records with Zendesk Support',
    dataFlows: ['tickets', 'contacts', 'call_records'],
    logo: '/integrations/zendesk.svg',
    fields: ['subdomain', 'email', 'token'],
  },
  freshdesk: {
    name: 'freshdesk',
    displayName: 'Freshdesk',
    category: 'helpdesk',
    description: 'Sync tickets, contacts, and call records with Freshdesk',
    dataFlows: ['tickets', 'contacts', 'call_records'],
    logo: '/integrations/freshdesk.svg',
    fields: ['domain', 'apiKey'],
  },
  salesforce: {
    name: 'salesforce',
    displayName: 'Salesforce',
    category: 'crm',
    description: 'Sync cases, contacts, and activities with Salesforce CRM',
    dataFlows: ['tickets', 'contacts', 'call_records'],
    logo: '/integrations/salesforce.svg',
    fields: ['instanceUrl', 'clientId', 'clientSecret'],
  },
  hubspot: {
    name: 'hubspot',
    displayName: 'HubSpot',
    category: 'crm',
    description: 'Sync contacts and activities with HubSpot CRM',
    dataFlows: ['contacts', 'call_records'],
    logo: '/integrations/hubspot.svg',
    fields: ['apiKey'],
  },
  slack: {
    name: 'slack',
    displayName: 'Slack',
    category: 'communication',
    description: 'Send escalation alerts and notifications to Slack channels',
    dataFlows: ['notifications'],
    logo: '/integrations/slack.svg',
    fields: ['webhookUrl', 'channel'],
  },
  intercom: {
    name: 'intercom',
    displayName: 'Intercom',
    category: 'helpdesk',
    description: 'Sync conversations and contacts with Intercom',
    dataFlows: ['tickets', 'contacts'],
    logo: '/integrations/intercom.svg',
    fields: ['accessToken'],
  },
  jira: {
    name: 'jira',
    displayName: 'Jira',
    category: 'helpdesk',
    description: 'Create and update Jira issues from support tickets',
    dataFlows: ['tickets'],
    logo: '/integrations/jira.svg',
    fields: ['domain', 'email', 'apiToken', 'projectKey'],
  },
  zapier: {
    name: 'zapier',
    displayName: 'Zapier',
    category: 'storage',
    description: 'Connect with 5000+ apps via Zapier webhooks',
    dataFlows: ['webhooks'],
    logo: '/integrations/zapier.svg',
    fields: ['webhookUrl'],
  },
  sendgrid: {
    name: 'sendgrid',
    displayName: 'SendGrid',
    category: 'communication',
    description: 'Send email notifications and summaries via SendGrid',
    dataFlows: ['emails'],
    logo: '/integrations/sendgrid.svg',
    fields: ['apiKey', 'fromEmail'],
  },
};

// Validation schemas
const zendeskConnectSchema = z.object({
  subdomain: z.string().min(1),
  email: z.string().email(),
  token: z.string().min(1),
});

const freshdeskConnectSchema = z.object({
  domain: z.string().min(1),
  apiKey: z.string().min(1),
});

const salesforceConnectSchema = z.object({
  instanceUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const hubspotConnectSchema = z.object({
  apiKey: z.string().min(1),
});

const slackConnectSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().optional(),
});

/**
 * GET /integrations
 * List all integrations with their status
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    // Load company integrations
    const company = await Company.findById(companyId)
      .select('integrations')
      .lean();

    if (!company) {
      throw AppError.notFound('Company');
    }

    // Get orchestrator for health info
    let healthInfo: Record<string, { status: string; circuitOpen: boolean }> = {};
    try {
      const orchestrator = await getOrchestrator(companyId);
      const allHealth = orchestrator.getAllHealth();
      healthInfo = Object.fromEntries(
        Object.entries(allHealth).map(([name, health]) => [
          name,
          { status: health.status, circuitOpen: health.circuitOpen },
        ])
      );
    } catch {
      // Orchestrator not available
    }

    // Build response
    const integrations = Object.entries(INTEGRATIONS_METADATA).map(([name, meta]) => {
      const companyIntegration = (company.integrations as Record<string, unknown>)?.[name];
      const isConnected = !!companyIntegration;
      const health = healthInfo[name];

      let status: 'connected' | 'disconnected' | 'needs_reauth' = 'disconnected';
      if (isConnected) {
        if (health?.status === 'unhealthy') {
          status = 'needs_reauth';
        } else {
          status = 'connected';
        }
      }

      return {
        ...meta,
        status,
        health: health || null,
        lastSync: null, // TODO: Track last sync time
      };
    });

    // Count active
    const activeCount = integrations.filter((i) => i.status === 'connected').length;

    res.json({
      integrations,
      stats: {
        active: activeCount,
        total: integrations.length,
      },
    });
  })
);

/**
 * POST /integrations/:name/connect
 * Connect an integration with credentials
 */
router.post(
  '/:name/connect',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { name } = req.params;

    // Validate integration name
    if (!(name in INTEGRATIONS_METADATA)) {
      throw AppError.badRequest(`Unknown integration: ${name}`);
    }

    let updateData: Record<string, unknown> = {};

    // Validate and encrypt credentials based on integration type
    switch (name) {
      case 'zendesk': {
        const data = zendeskConnectSchema.parse(req.body);
        updateData = {
          'integrations.zendesk': {
            subdomain: data.subdomain,
            email: data.email,
            tokenEncrypted: encryptCredential(data.token),
          },
        };
        break;
      }
      case 'freshdesk': {
        const data = freshdeskConnectSchema.parse(req.body);
        updateData = {
          'integrations.freshdesk': {
            domain: data.domain,
            apiKeyEncrypted: encryptCredential(data.apiKey),
          },
        };
        break;
      }
      case 'salesforce': {
        const data = salesforceConnectSchema.parse(req.body);
        updateData = {
          'integrations.salesforce': {
            instanceUrl: data.instanceUrl,
            clientId: data.clientId,
            clientSecretEncrypted: encryptCredential(data.clientSecret),
          },
        };
        break;
      }
      case 'hubspot': {
        const data = hubspotConnectSchema.parse(req.body);
        updateData = {
          'integrations.hubspot': {
            apiKeyEncrypted: encryptCredential(data.apiKey),
          },
        };
        break;
      }
      case 'slack': {
        const data = slackConnectSchema.parse(req.body);
        updateData = {
          'integrations.slack': {
            webhookUrl: data.webhookUrl,
            channel: data.channel,
          },
        };
        break;
      }
      default:
        throw AppError.badRequest(`Integration ${name} not yet supported`);
    }

    // Update company
    await Company.findByIdAndUpdate(companyId, { $set: updateData });

    // Clear orchestrator cache to reload with new credentials
    clearOrchestratorCache(companyId);

    childLogger.info({ companyId, integration: name }, 'Integration connected');

    res.json({
      success: true,
      message: `${INTEGRATIONS_METADATA[name as keyof typeof INTEGRATIONS_METADATA].displayName} connected successfully`,
    });
  })
);

/**
 * POST /integrations/:name/test
 * Test an integration connection
 */
router.post(
  '/:name/test',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { name } = req.params;

    // Validate integration name
    if (!(name in INTEGRATIONS_METADATA)) {
      throw AppError.badRequest(`Unknown integration: ${name}`);
    }

    // Get orchestrator and test connection
    try {
      const orchestrator = await getOrchestrator(companyId);
      const adapter = orchestrator.getAdapter(name);

      if (!adapter) {
        res.json({ ok: false, error: 'Integration not connected' });
        return;
      }

      const result = await adapter.testConnection();

      childLogger.info({ companyId, integration: name, ok: result.ok }, 'Integration test completed');

      res.json(result);
    } catch (error) {
      const message = (error as Error).message;
      res.json({ ok: false, error: message });
    }
  })
);

/**
 * DELETE /integrations/:name
 * Disconnect an integration
 */
router.delete(
  '/:name',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { name } = req.params;

    // Validate integration name
    if (!(name in INTEGRATIONS_METADATA)) {
      throw AppError.badRequest(`Unknown integration: ${name}`);
    }

    // Remove integration from company
    await Company.findByIdAndUpdate(companyId, {
      $unset: { [`integrations.${name}`]: 1 },
    });

    // Clear orchestrator cache
    clearOrchestratorCache(companyId);

    childLogger.info({ companyId, integration: name }, 'Integration disconnected');

    res.json({
      success: true,
      message: `${INTEGRATIONS_METADATA[name as keyof typeof INTEGRATIONS_METADATA].displayName} disconnected`,
    });
  })
);

/**
 * GET /integrations/:name
 * Get details for a specific integration
 */
router.get(
  '/:name',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { name } = req.params;

    // Validate integration name
    if (!(name in INTEGRATIONS_METADATA)) {
      throw AppError.badRequest(`Unknown integration: ${name}`);
    }

    const meta = INTEGRATIONS_METADATA[name as keyof typeof INTEGRATIONS_METADATA];

    // Load company integrations
    const company = await Company.findById(companyId)
      .select('integrations')
      .lean();

    if (!company) {
      throw AppError.notFound('Company');
    }

    const companyIntegration = (company.integrations as Record<string, unknown>)?.[name] as Record<
      string,
      unknown
    > | undefined;

    // Get health info
    let health = null;
    if (companyIntegration) {
      try {
        const orchestrator = await getOrchestrator(companyId);
        const adapter = orchestrator.getAdapter(name);
        if (adapter) {
          health = adapter.getHealth();
        }
      } catch {
        // Orchestrator not available
      }
    }

    // Build masked credentials for display
    let credentials: Record<string, string> = {};
    if (companyIntegration) {
      switch (name) {
        case 'zendesk':
          credentials = {
            subdomain: companyIntegration.subdomain as string,
            email: companyIntegration.email as string,
            token: companyIntegration.tokenEncrypted
              ? maskCredential(decryptCredential(companyIntegration.tokenEncrypted as string))
              : '',
          };
          break;
        case 'freshdesk':
          credentials = {
            domain: companyIntegration.domain as string,
            apiKey: companyIntegration.apiKeyEncrypted
              ? maskCredential(decryptCredential(companyIntegration.apiKeyEncrypted as string))
              : '',
          };
          break;
        case 'salesforce':
          credentials = {
            instanceUrl: companyIntegration.instanceUrl as string,
            clientId: companyIntegration.clientId as string,
            clientSecret: '********',
          };
          break;
      }
    }

    res.json({
      ...meta,
      status: companyIntegration ? 'connected' : 'disconnected',
      credentials,
      health,
      syncConfig: {
        tickets: true,
        contacts: true,
        callRecords: true,
      },
    });
  })
);

/**
 * POST /integrations/:name/sync
 * Trigger a manual sync for an integration
 */
router.post(
  '/:name/sync',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { name } = req.params;

    // Validate integration name
    if (!(name in INTEGRATIONS_METADATA)) {
      throw AppError.badRequest(`Unknown integration: ${name}`);
    }

    // TODO: Queue sync job
    childLogger.info({ companyId, integration: name }, 'Manual sync requested');

    res.json({
      success: true,
      message: 'Sync queued',
    });
  })
);

export default router;
