import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from '../../config/logger.js';
import { decryptCredential, encryptCredential } from '../../services/credentialCrypto.js';
import { redis } from '../../config/redis.js';
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

const childLogger = logger.child({ adapter: 'salesforce' });

export interface SalesforceConfig extends AdapterConfig {
  instanceUrl: string;
  clientId: string;
  clientSecretEncrypted: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
}

/**
 * Priority mapping: internal → Salesforce Case Priority
 */
const PRIORITY_TO_SALESFORCE: Record<string, string> = {
  low: 'Low',
  normal: 'Medium',
  high: 'High',
  urgent: 'Critical',
};

/**
 * Priority mapping: Salesforce → internal
 */
const SALESFORCE_TO_PRIORITY: Record<string, string> = {
  Low: 'low',
  Medium: 'normal',
  High: 'high',
  Critical: 'urgent',
};

const TOKEN_CACHE_KEY = 'salesforce:token';
const TOKEN_REFRESH_INTERVAL = 90 * 60 * 1000; // 90 minutes

/**
 * Salesforce API adapter using OAuth 2.0 client credentials flow
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
 */
export class SalesforceAdapter implements IntegrationAdapter {
  readonly name = 'salesforce';
  readonly displayName = 'Salesforce';
  readonly category = 'crm' as const;
  readonly dataFlows = ['tickets', 'contacts', 'call_records'] as const;

  private client: AxiosInstance | null = null;
  private config: SalesforceConfig;
  private health: IntegrationHealth;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;

  constructor(config: SalesforceConfig) {
    this.config = config;
    
    // Initialize health
    this.health = {
      status: 'healthy',
      lastCheck: new Date(),
      errorCount: 0,
    };

    // Initialize client will be done on first request
    this.initializeClient();

    childLogger.info({ instanceUrl: config.instanceUrl }, 'Salesforce adapter initialized');
  }

  private async initializeClient(): Promise<void> {
    try {
      const accessToken = await this.getAccessToken();
      
      this.client = axios.create({
        baseURL: `${this.config.instanceUrl}/services/data/v59.0`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      // Configure retry
      axiosRetry(this.client, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: (error) => {
          // Retry on network errors or 401 (token expired)
          if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
            return true;
          }
          if (error.response?.status === 401) {
            // Token expired, refresh and retry
            this.refreshToken().catch(() => {});
            return true;
          }
          return false;
        },
      });

      // Add interceptor to refresh token on 401
      this.client.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
          if (error.response?.status === 401) {
            await this.refreshToken();
            // Retry the request with new token
            const config = error.config;
            if (config && this.client) {
              const newToken = await this.getAccessToken();
              config.headers.Authorization = `Bearer ${newToken}`;
              return this.client.request(config);
            }
          }
          throw error;
        }
      );

      // Set up token refresh timer
      this.scheduleTokenRefresh();
    } catch (error) {
      childLogger.error({ error }, 'Failed to initialize Salesforce client');
      this.health.status = 'unhealthy';
      this.health.message = 'Failed to authenticate';
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check cache first
    const cacheKey = `${this.config.companyId}:${TOKEN_CACHE_KEY}`;
    const cachedToken = await redis.get(cacheKey);
    
    if (cachedToken) {
      return cachedToken;
    }

    // If we have a stored access token, decrypt and use it
    if (this.config.accessTokenEncrypted) {
      try {
        const token = decryptCredential(this.config.accessTokenEncrypted);
        await redis.setex(cacheKey, 3600, token); // Cache for 1 hour
        return token;
      } catch {
        // Token invalid, need to refresh
      }
    }

    // Authenticate with client credentials flow
    return this.authenticate();
  }

  private async authenticate(): Promise<string> {
    try {
      const clientSecret = decryptCredential(this.config.clientSecretEncrypted);
      
      const response = await axios.post(
        `${this.config.instanceUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: clientSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token } = response.data;
      
      // Cache the token
      const cacheKey = `${this.config.companyId}:${TOKEN_CACHE_KEY}`;
      await redis.setex(cacheKey, 3600, access_token);

      childLogger.info('Salesforce authentication successful');
      
      return access_token;
    } catch (error) {
      childLogger.error({ error }, 'Salesforce authentication failed');
      throw error;
    }
  }

  private async refreshToken(): Promise<void> {
    try {
      const newToken = await this.authenticate();
      
      if (this.client) {
        this.client.defaults.headers.Authorization = `Bearer ${newToken}`;
      }

      childLogger.info('Salesforce token refreshed');
    } catch (error) {
      childLogger.error({ error }, 'Failed to refresh Salesforce token');
      this.health.status = 'unhealthy';
      this.health.message = 'Token refresh failed';
    }
  }

  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }

    this.tokenRefreshTimer = setInterval(() => {
      this.refreshToken().catch(() => {});
    }, TOKEN_REFRESH_INTERVAL);
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

  private async ensureClient(): Promise<AxiosInstance> {
    if (!this.client) {
      await this.initializeClient();
    }
    if (!this.client) {
      throw new Error('Salesforce client not initialized');
    }
    return this.client;
  }

  async getCustomerByEmail(email: string): Promise<CustomerInfo | null> {
    const start = Date.now();
    try {
      const client = await this.ensureClient();
      
      const query = `SELECT Id, Email, Phone, Name, Account.Name FROM Contact WHERE Email = '${email}' LIMIT 1`;
      const response = await client.get('/query', {
        params: { q: query },
      });

      const records = response.data.records;
      this.updateHealth(true, Date.now() - start);

      if (!records || records.length === 0) {
        return null;
      }

      const contact = records[0];
      return {
        id: contact.Id,
        email: contact.Email,
        phone: contact.Phone,
        name: contact.Name,
        company: contact.Account?.Name,
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
      const client = await this.ensureClient();
      
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
      const query = `SELECT Id, Email, Phone, Name, Account.Name FROM Contact WHERE Phone LIKE '%${normalizedPhone.slice(-10)}%' LIMIT 1`;
      
      const response = await client.get('/query', {
        params: { q: query },
      });

      const records = response.data.records;
      this.updateHealth(true, Date.now() - start);

      if (!records || records.length === 0) {
        return null;
      }

      const contact = records[0];
      return {
        id: contact.Id,
        email: contact.Email,
        phone: contact.Phone,
        name: contact.Name,
        company: contact.Account?.Name,
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
      const client = await this.ensureClient();
      
      const caseData: Record<string, unknown> = {
        Subject: ticket.subject,
        Description: ticket.description,
        Priority: ticket.priority ? PRIORITY_TO_SALESFORCE[ticket.priority] : 'Medium',
        Status: 'New',
        Origin: 'Phone',
      };

      // Find contact by email if provided
      if (ticket.requesterEmail) {
        const contact = await this.getCustomerByEmail(ticket.requesterEmail);
        if (contact) {
          caseData.ContactId = contact.id;
        }
      }

      const response = await client.post('/sobjects/Case', caseData);

      const caseId = response.data.id;
      this.updateHealth(true, Date.now() - start);

      childLogger.info({ caseId }, 'Salesforce case created');

      return {
        id: caseId,
        url: `${this.config.instanceUrl}/lightning/r/Case/${caseId}/view`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticket }, 'Failed to create Salesforce case');
      throw error;
    }
  }

  async updateTicket(ticketId: string, data: UpdateTicketInput): Promise<TicketInfo> {
    const start = Date.now();
    try {
      const client = await this.ensureClient();
      
      const updateData: Record<string, unknown> = {};

      if (data.status) {
        updateData.Status = data.status;
      }
      if (data.priority) {
        updateData.Priority = PRIORITY_TO_SALESFORCE[data.priority];
      }
      if (data.assigneeId) {
        updateData.OwnerId = data.assigneeId;
      }

      await client.patch(`/sobjects/Case/${ticketId}`, updateData);

      // Fetch updated case
      const caseResponse = await client.get(`/sobjects/Case/${ticketId}`);
      const updatedCase = caseResponse.data;

      this.updateHealth(true, Date.now() - start);

      return {
        id: updatedCase.Id,
        url: `${this.config.instanceUrl}/lightning/r/Case/${updatedCase.Id}/view`,
        subject: updatedCase.Subject,
        status: updatedCase.Status,
        priority: SALESFORCE_TO_PRIORITY[updatedCase.Priority] || 'normal',
        updatedAt: new Date(updatedCase.LastModifiedDate),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to update Salesforce case');
      throw error;
    }
  }

  async closeTicket(ticketId: string, resolution: string): Promise<TicketInfo> {
    const start = Date.now();
    try {
      const client = await this.ensureClient();
      
      // Add resolution note
      await this.addNote(ticketId, `Resolution: ${resolution}`, true);

      // Close the case
      await client.patch(`/sobjects/Case/${ticketId}`, {
        Status: 'Closed',
      });

      // Fetch updated case
      const caseResponse = await client.get(`/sobjects/Case/${ticketId}`);
      const closedCase = caseResponse.data;

      this.updateHealth(true, Date.now() - start);

      return {
        id: closedCase.Id,
        url: `${this.config.instanceUrl}/lightning/r/Case/${closedCase.Id}/view`,
        subject: closedCase.Subject,
        status: 'Closed',
        priority: SALESFORCE_TO_PRIORITY[closedCase.Priority] || 'normal',
        updatedAt: new Date(closedCase.LastModifiedDate),
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to close Salesforce case');
      throw error;
    }
  }

  async addNote(ticketId: string, note: string, internal: boolean): Promise<void> {
    const start = Date.now();
    try {
      const client = await this.ensureClient();
      
      // Create ContentNote
      const noteResponse = await client.post('/sobjects/ContentNote', {
        Title: `Note - ${new Date().toISOString()}`,
        Content: Buffer.from(note).toString('base64'),
      });

      // Link to Case
      await client.post('/sobjects/ContentDocumentLink', {
        ContentDocumentId: noteResponse.data.id,
        LinkedEntityId: ticketId,
        ShareType: internal ? 'I' : 'V',
        Visibility: internal ? 'InternalUsers' : 'AllUsers',
      });

      this.updateHealth(true, Date.now() - start);
      childLogger.debug({ ticketId, internal }, 'Note added to Salesforce case');
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, ticketId }, 'Failed to add note to Salesforce case');
      throw error;
    }
  }

  async syncCallRecord(input: SyncCallRecordInput): Promise<{ id: string; url?: string }> {
    const start = Date.now();
    try {
      const client = await this.ensureClient();
      
      // Create a Case for the call
      const caseData: Record<string, unknown> = {
        Subject: `Voice Call - ${input.callId}`,
        Description: this.buildCallDescription(input),
        Priority: 'Medium',
        Status: 'Closed',
        Origin: 'Phone',
        Type: 'Voice Call',
      };

      // Find contact by phone if provided
      if (input.callerPhone) {
        const contact = await this.getCustomerByPhone(input.callerPhone);
        if (contact) {
          caseData.ContactId = contact.id;
        }
      }

      const response = await client.post('/sobjects/Case', caseData);
      const caseId = response.data.id;

      // Add transcript as ContentNote if available
      if (input.transcript) {
        await this.addNote(caseId, input.transcript, true);
      }

      this.updateHealth(true, Date.now() - start);

      childLogger.info({ caseId, callId: input.callId }, 'Call record synced to Salesforce');

      return {
        id: caseId,
        url: `${this.config.instanceUrl}/lightning/r/Case/${caseId}/view`,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.updateHealth(false, Date.now() - start, message);
      childLogger.error({ error, callId: input.callId }, 'Failed to sync call record to Salesforce');
      throw error;
    }
  }

  private buildCallDescription(input: SyncCallRecordInput): string {
    const parts = [
      'Call Summary:',
      input.summary,
      '',
      '---',
      '',
      'Call Details:',
      `Call ID: ${input.callId}`,
    ];

    if (input.callerPhone) {
      parts.push(`Caller: ${input.callerPhone}`);
    }
    if (input.duration) {
      parts.push(`Duration: ${Math.floor(input.duration / 60)}m ${input.duration % 60}s`);
    }
    if (input.sentiment) {
      parts.push(`Sentiment: ${input.sentiment}`);
    }
    if (input.outcome) {
      parts.push(`Outcome: ${input.outcome}`);
    }
    if (input.recordingUrl) {
      parts.push(`Recording: ${input.recordingUrl}`);
    }

    return parts.join('\n');
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = await this.ensureClient();
      const response = await client.get('/limits');
      
      if (response.data) {
        childLogger.info('Salesforce connection test passed');
        return { ok: true };
      }
      
      return { ok: false, error: 'Invalid response from Salesforce API' };
    } catch (error) {
      const message = (error as Error).message || 'Unknown error';
      childLogger.error({ error }, 'Salesforce connection test failed');
      return { ok: false, error: message };
    }
  }

  getHealth(): IntegrationHealth {
    return { ...this.health };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }
}
