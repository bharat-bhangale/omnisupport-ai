import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from '../../config/logger.js';
import { decryptCredential } from '../../services/credentialCrypto.js';
import type {
  IntegrationAdapter,
  CustomerInfo,
  CreateTicketInput,
  TicketInfo,
  UpdateTicketInput,
  SyncCallRecordInput,
  IntegrationHealth,
  AdapterConfig,
} from '../IntegrationAdapter.js';

const childLogger = logger.child({ adapter: 'zendesk' });

export interface ZendeskConfig extends AdapterConfig {
  subdomain: string;
  email: string;
  tokenEncrypted: string;
}

/**
 * Priority mapping: internal → Zendesk
 */
const PRIORITY_TO_ZENDESK: Record<string, string> = {
  low: 'low',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
};

/**
 * Priority mapping: Zendesk → internal
 */
const ZENDESK_TO_PRIORITY: Record<string, string> = {
  low: 'low',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
};

/**
 * Zendesk API adapter
 * https://developer.zendesk.com/api-reference/
 */
export class ZendeskAdapter implements IntegrationAdapter {
  readonly name = 'zendesk';
  readonly displayName = 'Zendesk';
  readonly category = 'helpdesk' as const;
  readonly dataFlows = ['tickets', 'contacts', 'call_records'] as const;

  private client: AxiosInstance;
  private config: ZendeskConfig;
  private health: IntegrationHealth;

  constructor(config: ZendeskConfig) {
    this.config = config;
    
    // Decrypt token
    const token = decryptCredential(config.tokenEncrypted);
    
    // Create axios client
    this.client = axios.create({
      baseURL: `https://${config.subdomain}.zendesk.com/api/v2`,
      auth: {
        username: `${config.email}/token`,
        password: token,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Configure retry with exponential backoff for rate limits
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: (retryCount, error) => {
        if ((error as AxiosError).response?.status === 429) {
          // Get retry-after header or default to exponential backoff
          const retryAfter = (error as AxiosError).response?.headers['retry-after'];
          if (retryAfter) {
            return parseInt(retryAfter, 10) * 1000;
          }
        }
        return axiosRetry.exponentialDelay(retryCount);
      },
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      },
    });

    // Initialize health
    this.health = {
      status: 'healthy',
      lastCheck: new Date(),
      errorCount: 0,
    };

    childLogger.info({ subdomain: config.subdomain }, 'Zendesk adapter initialized');
  }

  private updateHealth(success: boolean, latencyMs?: number, error?: string): void {
    this.health.lastCheck = new Date();
    if (success) {
      this.health.lastSuccess = new Date();
      this.health.errorCount = 0;
      this.health.status = 'healthy';
      if (latencyMs) {
        this.health.avgLatencyMs = this.health.avgLatencyMs
          ? (this.health.avgLatencyMs + latencyMs) / 2
          : latencyMs;
      }
    } else {
      this.health.errorCount++;
      this.health.message = error;
      if (this.health.errorCount >= 3) {
        this.health.status = 'unhealthy';
      } else {
        this.health.status = 'degraded';
      }
    }
  }

  async getCustomerByEmail(email: string): Promise<CustomerInfo | null> {
    const start = Date.now();
    try {
      const response = await this.client.get('/users/search.json', {
        params: { query: `email:${email}` },
      });

      const users = response.data.users;
      this.updateHealth(true, Date.now() - start);

      if (!users || users.length === 0) {
        return null;
      }

      const user = users[0];
      return {
        id: user.id.toString(),
        externalId: user.external_id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        tags: user.tags,
        createdAt: user.created_at ? new Date(user.created_at) : undefined,
        updatedAt: user.updated_at ? new Date(user.updated_at) : undefined,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, email }, 'Failed to get customer by email');
      return null;
    }
  }

  async getCustomerByPhone(phone: string): Promise<CustomerInfo | null> {
    const start = Date.now();
    try {
      // Normalize phone number
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
      
      const response = await this.client.get('/users/search.json', {
        params: { query: `phone:${normalizedPhone}` },
      });

      const users = response.data.users;
      this.updateHealth(true, Date.now() - start);

      if (!users || users.length === 0) {
        return null;
      }

      const user = users[0];
      return {
        id: user.id.toString(),
        externalId: user.external_id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        tags: user.tags,
        createdAt: user.created_at ? new Date(user.created_at) : undefined,
        updatedAt: user.updated_at ? new Date(user.updated_at) : undefined,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, phone }, 'Failed to get customer by phone');
      return null;
    }
  }

  async createTicket(ticket: CreateTicketInput): Promise<{ id: string; url: string }> {
    const start = Date.now();
    try {
      const ticketData: Record<string, unknown> = {
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority ? PRIORITY_TO_ZENDESK[ticket.priority] : 'normal',
        tags: ticket.tags || [],
      };

      // Set requester
      if (ticket.requesterEmail) {
        ticketData.requester = { email: ticket.requesterEmail, name: ticket.requesterName };
      }

      // Add custom fields
      if (ticket.customFields) {
        ticketData.custom_fields = Object.entries(ticket.customFields).map(([id, value]) => ({
          id: parseInt(id, 10),
          value,
        }));
      }

      const response = await this.client.post('/tickets.json', {
        ticket: ticketData,
      });

      const createdTicket = response.data.ticket;
      this.updateHealth(true, Date.now() - start);

      childLogger.info({ ticketId: createdTicket.id }, 'Zendesk ticket created');

      return {
        id: createdTicket.id.toString(),
        url: `https://${this.config.subdomain}.zendesk.com/agent/tickets/${createdTicket.id}`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticket }, 'Failed to create Zendesk ticket');
      throw error;
    }
  }

  async updateTicket(ticketId: string, data: UpdateTicketInput): Promise<TicketInfo> {
    const start = Date.now();
    try {
      const updateData: Record<string, unknown> = {};

      if (data.status) {
        updateData.status = data.status;
      }
      if (data.priority) {
        updateData.priority = PRIORITY_TO_ZENDESK[data.priority];
      }
      if (data.assigneeId) {
        updateData.assignee_id = parseInt(data.assigneeId, 10);
      }
      if (data.tags) {
        updateData.tags = data.tags;
      }
      if (data.customFields) {
        updateData.custom_fields = Object.entries(data.customFields).map(([id, value]) => ({
          id: parseInt(id, 10),
          value,
        }));
      }

      const response = await this.client.put(`/tickets/${ticketId}.json`, {
        ticket: updateData,
      });

      const updatedTicket = response.data.ticket;
      this.updateHealth(true, Date.now() - start);

      return {
        id: updatedTicket.id.toString(),
        url: `https://${this.config.subdomain}.zendesk.com/agent/tickets/${updatedTicket.id}`,
        subject: updatedTicket.subject,
        status: updatedTicket.status,
        priority: ZENDESK_TO_PRIORITY[updatedTicket.priority] || updatedTicket.priority,
        updatedAt: new Date(updatedTicket.updated_at),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to update Zendesk ticket');
      throw error;
    }
  }

  async closeTicket(ticketId: string, resolution: string): Promise<TicketInfo> {
    const start = Date.now();
    try {
      // Add resolution as internal note then close
      await this.addNote(ticketId, `Resolution: ${resolution}`, true);

      const response = await this.client.put(`/tickets/${ticketId}.json`, {
        ticket: { status: 'solved' },
      });

      const closedTicket = response.data.ticket;
      this.updateHealth(true, Date.now() - start);

      return {
        id: closedTicket.id.toString(),
        url: `https://${this.config.subdomain}.zendesk.com/agent/tickets/${closedTicket.id}`,
        subject: closedTicket.subject,
        status: closedTicket.status,
        priority: ZENDESK_TO_PRIORITY[closedTicket.priority] || closedTicket.priority,
        updatedAt: new Date(closedTicket.updated_at),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to close Zendesk ticket');
      throw error;
    }
  }

  async addNote(ticketId: string, note: string, internal: boolean): Promise<void> {
    const start = Date.now();
    try {
      await this.client.put(`/tickets/${ticketId}.json`, {
        ticket: {
          comment: {
            body: note,
            public: !internal,
          },
        },
      });

      this.updateHealth(true, Date.now() - start);
      childLogger.debug({ ticketId, internal }, 'Note added to Zendesk ticket');
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to add note to Zendesk ticket');
      throw error;
    }
  }

  async syncCallRecord(input: SyncCallRecordInput): Promise<{ id: string; url?: string }> {
    const start = Date.now();
    try {
      // Create a ticket for the call record
      const ticketData = {
        subject: `Voice Call - ${input.callId}`,
        description: this.buildCallDescription(input),
        priority: 'normal',
        tags: ['voice-call', 'ai-handled'],
        custom_fields: [] as Array<{ id: number; value: string }>,
      };

      // Add sentiment as tag if available
      if (input.sentiment) {
        ticketData.tags.push(`sentiment-${input.sentiment}`);
      }

      const response = await this.client.post('/tickets.json', {
        ticket: ticketData,
      });

      const ticket = response.data.ticket;
      this.updateHealth(true, Date.now() - start);

      childLogger.info({ ticketId: ticket.id, callId: input.callId }, 'Call record synced to Zendesk');

      return {
        id: ticket.id.toString(),
        url: `https://${this.config.subdomain}.zendesk.com/agent/tickets/${ticket.id}`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, callId: input.callId }, 'Failed to sync call record to Zendesk');
      throw error;
    }
  }

  private buildCallDescription(input: SyncCallRecordInput): string {
    const parts = [
      '## Call Summary',
      input.summary,
      '',
      '---',
      '',
      '**Call Details:**',
      `- Call ID: ${input.callId}`,
    ];

    if (input.callerPhone) {
      parts.push(`- Caller: ${input.callerPhone}`);
    }
    if (input.duration) {
      parts.push(`- Duration: ${Math.floor(input.duration / 60)}m ${input.duration % 60}s`);
    }
    if (input.sentiment) {
      parts.push(`- Sentiment: ${input.sentiment}`);
    }
    if (input.outcome) {
      parts.push(`- Outcome: ${input.outcome}`);
    }
    if (input.recordingUrl) {
      parts.push(`- [Recording](${input.recordingUrl})`);
    }

    if (input.transcript) {
      parts.push('', '---', '', '## Transcript', '', input.transcript);
    }

    return parts.join('\n');
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.get('/users/me.json');
      
      if (response.data.user) {
        childLogger.info({ userId: response.data.user.id }, 'Zendesk connection test passed');
        return { ok: true };
      }
      
      return { ok: false, error: 'Invalid response from Zendesk API' };
    } catch (error) {
      const message = (error as AxiosError).response?.data?.error ||
        (error as Error).message ||
        'Unknown error';
      childLogger.error({ error }, 'Zendesk connection test failed');
      return { ok: false, error: message as string };
    }
  }

  getHealth(): IntegrationHealth {
    return { ...this.health };
  }
}
