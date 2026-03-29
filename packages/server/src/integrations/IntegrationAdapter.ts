/**
 * Base interface for all CRM/Helpdesk integration adapters
 */

export interface CustomerInfo {
  id: string;
  externalId?: string;
  email?: string;
  phone?: string;
  name?: string;
  company?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requesterEmail?: string;
  requesterPhone?: string;
  requesterName?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  internalNote?: string;
}

export interface TicketInfo {
  id: string;
  externalId?: string;
  url?: string;
  subject: string;
  status: string;
  priority: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UpdateTicketInput {
  status?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  assigneeId?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface SyncCallRecordInput {
  callId: string;
  summary: string;
  transcript?: string;
  duration?: number;
  callerPhone?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  outcome?: string;
  recordingUrl?: string;
}

export interface IntegrationHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  lastSuccess?: Date;
  errorCount: number;
  avgLatencyMs?: number;
  message?: string;
}

export interface IntegrationAdapter {
  /**
   * Unique name identifier for this adapter
   */
  readonly name: string;

  /**
   * Display name for UI
   */
  readonly displayName: string;

  /**
   * Category of integration
   */
  readonly category: 'helpdesk' | 'crm' | 'communication' | 'storage';

  /**
   * Data flows supported
   */
  readonly dataFlows: Array<'tickets' | 'contacts' | 'call_records'>;

  /**
   * Get customer by email address
   */
  getCustomerByEmail(email: string): Promise<CustomerInfo | null>;

  /**
   * Get customer by phone number
   */
  getCustomerByPhone(phone: string): Promise<CustomerInfo | null>;

  /**
   * Create a new ticket/case
   */
  createTicket(ticket: CreateTicketInput): Promise<{ id: string; url: string }>;

  /**
   * Update an existing ticket
   */
  updateTicket(ticketId: string, data: UpdateTicketInput): Promise<TicketInfo>;

  /**
   * Close a ticket with resolution
   */
  closeTicket(ticketId: string, resolution: string): Promise<TicketInfo>;

  /**
   * Add a note to a ticket
   * @param internal - If true, note is only visible to agents
   */
  addNote(ticketId: string, note: string, internal: boolean): Promise<void>;

  /**
   * Sync a call record to the integration
   */
  syncCallRecord(input: SyncCallRecordInput): Promise<{ id: string; url?: string }>;

  /**
   * Test the connection/credentials
   */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /**
   * Get current health status
   */
  getHealth(): IntegrationHealth;
}

/**
 * Base configuration for all adapters
 */
export interface AdapterConfig {
  companyId: string;
  enabled: boolean;
}

/**
 * Priority mapping from internal to external values
 */
export const PRIORITY_MAP = {
  internal: {
    low: 1,
    normal: 2,
    high: 3,
    urgent: 4,
  },
  zendesk: {
    low: 'low',
    normal: 'normal',
    high: 'high',
    urgent: 'urgent',
  },
  freshdesk: {
    low: 1,
    normal: 2,
    high: 3,
    urgent: 4,
  },
  salesforce: {
    low: 'Low',
    normal: 'Medium',
    high: 'High',
    urgent: 'Critical',
  },
} as const;
