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

const childLogger = logger.child({ adapter: 'freshdesk' });

export interface FreshdeskConfig extends AdapterConfig {
  domain: string;
  apiKeyEncrypted: string;
}

/**
 * Priority mapping: internal → Freshdesk (1=Low, 2=Medium, 3=High, 4=Urgent)
 */
const PRIORITY_TO_FRESHDESK: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

/**
 * Priority mapping: Freshdesk → internal
 */
const FRESHDESK_TO_PRIORITY: Record<number, string> = {
  1: 'low',
  2: 'normal',
  3: 'high',
  4: 'urgent',
};

/**
 * Status mapping: Freshdesk (2=Open, 3=Pending, 4=Resolved, 5=Closed)
 */
const STATUS_TO_FRESHDESK: Record<string, number> = {
  open: 2,
  pending: 3,
  resolved: 4,
  closed: 5,
};

const FRESHDESK_TO_STATUS: Record<number, string> = {
  2: 'open',
  3: 'pending',
  4: 'resolved',
  5: 'closed',
};

/**
 * Freshdesk API adapter
 * https://developers.freshdesk.com/api/
 */
export class FreshdeskAdapter implements IntegrationAdapter {
  readonly name = 'freshdesk';
  readonly displayName = 'Freshdesk';
  readonly category = 'helpdesk' as const;
  readonly dataFlows = ['tickets', 'contacts', 'call_records'] as const;

  private client: AxiosInstance;
  private config: FreshdeskConfig;
  private health: IntegrationHealth;

  constructor(config: FreshdeskConfig) {
    this.config = config;
    
    // Decrypt API key
    const apiKey = decryptCredential(config.apiKeyEncrypted);
    
    // Create axios client with Basic auth (API key as username, 'X' as password)
    this.client = axios.create({
      baseURL: `https://${config.domain}.freshdesk.com/api/v2`,
      auth: {
        username: apiKey,
        password: 'X',
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Configure retry with exponential backoff
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: (retryCount, error) => {
        if ((error as AxiosError).response?.status === 429) {
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

    childLogger.info({ domain: config.domain }, 'Freshdesk adapter initialized');
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
      const response = await this.client.get('/contacts', {
        params: { email },
      });

      const contacts = response.data;
      this.updateHealth(true, Date.now() - start);

      if (!contacts || contacts.length === 0) {
        return null;
      }

      const contact = contacts[0];
      return {
        id: contact.id.toString(),
        email: contact.email,
        phone: contact.phone || contact.mobile,
        name: contact.name,
        company: contact.company_name,
        tags: contact.tags,
        createdAt: contact.created_at ? new Date(contact.created_at) : undefined,
        updatedAt: contact.updated_at ? new Date(contact.updated_at) : undefined,
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
      // Normalize phone
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
      
      const response = await this.client.get('/contacts', {
        params: { phone: normalizedPhone },
      });

      const contacts = response.data;
      this.updateHealth(true, Date.now() - start);

      if (!contacts || contacts.length === 0) {
        // Try mobile field
        const mobileResponse = await this.client.get('/contacts', {
          params: { mobile: normalizedPhone },
        });
        
        if (!mobileResponse.data || mobileResponse.data.length === 0) {
          return null;
        }
        
        const contact = mobileResponse.data[0];
        return {
          id: contact.id.toString(),
          email: contact.email,
          phone: contact.phone || contact.mobile,
          name: contact.name,
          company: contact.company_name,
          tags: contact.tags,
        };
      }

      const contact = contacts[0];
      return {
        id: contact.id.toString(),
        email: contact.email,
        phone: contact.phone || contact.mobile,
        name: contact.name,
        company: contact.company_name,
        tags: contact.tags,
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
        priority: ticket.priority ? PRIORITY_TO_FRESHDESK[ticket.priority] : 2,
        status: 2, // Open
        tags: ticket.tags || [],
        source: 7, // Phone (if from voice)
      };

      // Set requester
      if (ticket.requesterEmail) {
        ticketData.email = ticket.requesterEmail;
        if (ticket.requesterName) {
          ticketData.name = ticket.requesterName;
        }
      } else if (ticket.requesterPhone) {
        ticketData.phone = ticket.requesterPhone;
        if (ticket.requesterName) {
          ticketData.name = ticket.requesterName;
        }
      }

      // Add custom fields
      if (ticket.customFields) {
        ticketData.custom_fields = ticket.customFields;
      }

      const response = await this.client.post('/tickets', ticketData);

      const createdTicket = response.data;
      this.updateHealth(true, Date.now() - start);

      childLogger.info({ ticketId: createdTicket.id }, 'Freshdesk ticket created');

      return {
        id: createdTicket.id.toString(),
        url: `https://${this.config.domain}.freshdesk.com/a/tickets/${createdTicket.id}`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticket }, 'Failed to create Freshdesk ticket');
      throw error;
    }
  }

  async updateTicket(ticketId: string, data: UpdateTicketInput): Promise<TicketInfo> {
    const start = Date.now();
    try {
      const updateData: Record<string, unknown> = {};

      if (data.status) {
        updateData.status = STATUS_TO_FRESHDESK[data.status] || 2;
      }
      if (data.priority) {
        updateData.priority = PRIORITY_TO_FRESHDESK[data.priority];
      }
      if (data.assigneeId) {
        updateData.responder_id = parseInt(data.assigneeId, 10);
      }
      if (data.tags) {
        updateData.tags = data.tags;
      }
      if (data.customFields) {
        updateData.custom_fields = data.customFields;
      }

      const response = await this.client.put(`/tickets/${ticketId}`, updateData);

      const updatedTicket = response.data;
      this.updateHealth(true, Date.now() - start);

      return {
        id: updatedTicket.id.toString(),
        url: `https://${this.config.domain}.freshdesk.com/a/tickets/${updatedTicket.id}`,
        subject: updatedTicket.subject,
        status: FRESHDESK_TO_STATUS[updatedTicket.status] || 'open',
        priority: FRESHDESK_TO_PRIORITY[updatedTicket.priority] || 'normal',
        updatedAt: new Date(updatedTicket.updated_at),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to update Freshdesk ticket');
      throw error;
    }
  }

  async closeTicket(ticketId: string, resolution: string): Promise<TicketInfo> {
    const start = Date.now();
    try {
      // Add resolution note
      await this.addNote(ticketId, `Resolution: ${resolution}`, true);

      // Close the ticket
      const response = await this.client.put(`/tickets/${ticketId}`, {
        status: 5, // Closed
      });

      const closedTicket = response.data;
      this.updateHealth(true, Date.now() - start);

      return {
        id: closedTicket.id.toString(),
        url: `https://${this.config.domain}.freshdesk.com/a/tickets/${closedTicket.id}`,
        subject: closedTicket.subject,
        status: 'closed',
        priority: FRESHDESK_TO_PRIORITY[closedTicket.priority] || 'normal',
        updatedAt: new Date(closedTicket.updated_at),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to close Freshdesk ticket');
      throw error;
    }
  }

  async addNote(ticketId: string, note: string, internal: boolean): Promise<void> {
    const start = Date.now();
    try {
      await this.client.post(`/tickets/${ticketId}/notes`, {
        body: note,
        private: internal,
      });

      this.updateHealth(true, Date.now() - start);
      childLogger.debug({ ticketId, internal }, 'Note added to Freshdesk ticket');
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to add note to Freshdesk ticket');
      throw error;
    }
  }

  async syncCallRecord(input: SyncCallRecordInput): Promise<{ id: string; url?: string }> {
    const start = Date.now();
    try {
      const ticketData: Record<string, unknown> = {
        subject: `Voice Call - ${input.callId}`,
        description: this.buildCallDescription(input),
        priority: 2, // Medium
        status: 4, // Resolved
        tags: ['voice-call', 'ai-handled'],
        source: 7, // Phone
      };

      if (input.sentiment) {
        (ticketData.tags as string[]).push(`sentiment-${input.sentiment}`);
      }

      if (input.callerPhone) {
        ticketData.phone = input.callerPhone;
      }

      const response = await this.client.post('/tickets', ticketData);

      const ticket = response.data;
      this.updateHealth(true, Date.now() - start);

      childLogger.info({ ticketId: ticket.id, callId: input.callId }, 'Call record synced to Freshdesk');

      return {
        id: ticket.id.toString(),
        url: `https://${this.config.domain}.freshdesk.com/a/tickets/${ticket.id}`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, callId: input.callId }, 'Failed to sync call record to Freshdesk');
      throw error;
    }
  }

  private buildCallDescription(input: SyncCallRecordInput): string {
    const parts = [
      '<h3>Call Summary</h3>',
      `<p>${input.summary}</p>`,
      '<hr>',
      '<h4>Call Details</h4>',
      '<ul>',
      `<li><strong>Call ID:</strong> ${input.callId}</li>`,
    ];

    if (input.callerPhone) {
      parts.push(`<li><strong>Caller:</strong> ${input.callerPhone}</li>`);
    }
    if (input.duration) {
      parts.push(`<li><strong>Duration:</strong> ${Math.floor(input.duration / 60)}m ${input.duration % 60}s</li>`);
    }
    if (input.sentiment) {
      parts.push(`<li><strong>Sentiment:</strong> ${input.sentiment}</li>`);
    }
    if (input.outcome) {
      parts.push(`<li><strong>Outcome:</strong> ${input.outcome}</li>`);
    }
    if (input.recordingUrl) {
      parts.push(`<li><a href="${input.recordingUrl}">Recording</a></li>`);
    }

    parts.push('</ul>');

    if (input.transcript) {
      parts.push('<hr>', '<h4>Transcript</h4>', `<pre>${input.transcript}</pre>`);
    }

    return parts.join('\n');
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.get('/agents/me');
      
      if (response.data) {
        childLogger.info({ agentId: response.data.id }, 'Freshdesk connection test passed');
        return { ok: true };
      }
      
      return { ok: false, error: 'Invalid response from Freshdesk API' };
    } catch (error) {
      const axiosError = error as AxiosError;
      const message = (axiosError.response?.data as { message?: string })?.message ||
        axiosError.message ||
        'Unknown error';
      childLogger.error({ error }, 'Freshdesk connection test failed');
      return { ok: false, error: message };
    }
  }

  getHealth(): IntegrationHealth {
    return { ...this.health };
  }
}
