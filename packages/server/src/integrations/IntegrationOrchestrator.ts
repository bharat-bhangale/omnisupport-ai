import { Company } from '../models/Company.js';
import { redis, buildRedisKey } from '../config/redis.js';
import { logger } from '../config/logger.js';
import type {
  IntegrationAdapter,
  CustomerInfo,
  SyncCallRecordInput,
  IntegrationHealth,
} from './IntegrationAdapter.js';
import { ZendeskAdapter, type ZendeskConfig } from './adapters/ZendeskAdapter.js';
import { FreshdeskAdapter, type FreshdeskConfig } from './adapters/FreshdeskAdapter.js';
import { SalesforceAdapter, type SalesforceConfig } from './adapters/SalesforceAdapter.js';

const childLogger = logger.child({ service: 'integrationOrchestrator' });

// Circuit breaker constants
const CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before opening circuit
const CIRCUIT_BREAKER_WINDOW = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_RESET = 10 * 60 * 1000; // 10 minutes to reset

interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  openedAt?: number;
}

// Cache of orchestrators by companyId
const orchestratorCache = new Map<string, IntegrationOrchestrator>();

/**
 * Get or create orchestrator for a company
 */
export async function getOrchestrator(companyId: string): Promise<IntegrationOrchestrator> {
  // Check cache
  const cached = orchestratorCache.get(companyId);
  if (cached) {
    return cached;
  }

  // Load company and create orchestrator
  const company = await Company.findById(companyId).lean();
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const orchestrator = new IntegrationOrchestrator(companyId, company.integrations);
  orchestratorCache.set(companyId, orchestrator);

  return orchestrator;
}

/**
 * Clear orchestrator cache for a company (e.g., when integrations change)
 */
export function clearOrchestratorCache(companyId: string): void {
  const cached = orchestratorCache.get(companyId);
  if (cached) {
    cached.destroy();
    orchestratorCache.delete(companyId);
  }
}

/**
 * Integration Orchestrator
 * Manages multiple integration adapters for a company
 */
export class IntegrationOrchestrator {
  private companyId: string;
  private adapters: Map<string, IntegrationAdapter> = new Map();
  private circuitBreakers: Map<string, CircuitState> = new Map();

  constructor(
    companyId: string,
    integrations: {
      zendesk?: { subdomain: string; email: string; tokenEncrypted: string };
      freshdesk?: { domain: string; apiKeyEncrypted: string };
      salesforce?: {
        instanceUrl: string;
        clientId: string;
        clientSecretEncrypted: string;
        accessTokenEncrypted?: string;
        refreshTokenEncrypted?: string;
      };
    }
  ) {
    this.companyId = companyId;

    // Initialize enabled adapters
    if (integrations.zendesk?.tokenEncrypted) {
      try {
        const adapter = new ZendeskAdapter({
          companyId,
          enabled: true,
          subdomain: integrations.zendesk.subdomain,
          email: integrations.zendesk.email,
          tokenEncrypted: integrations.zendesk.tokenEncrypted,
        });
        this.adapters.set('zendesk', adapter);
        this.circuitBreakers.set('zendesk', { failures: 0, lastFailure: 0, isOpen: false });
        childLogger.info({ companyId }, 'Zendesk adapter loaded');
      } catch (error) {
        childLogger.error({ error, companyId }, 'Failed to load Zendesk adapter');
      }
    }

    if (integrations.freshdesk?.apiKeyEncrypted) {
      try {
        const adapter = new FreshdeskAdapter({
          companyId,
          enabled: true,
          domain: integrations.freshdesk.domain,
          apiKeyEncrypted: integrations.freshdesk.apiKeyEncrypted,
        });
        this.adapters.set('freshdesk', adapter);
        this.circuitBreakers.set('freshdesk', { failures: 0, lastFailure: 0, isOpen: false });
        childLogger.info({ companyId }, 'Freshdesk adapter loaded');
      } catch (error) {
        childLogger.error({ error, companyId }, 'Failed to load Freshdesk adapter');
      }
    }

    if (integrations.salesforce?.clientSecretEncrypted) {
      try {
        const adapter = new SalesforceAdapter({
          companyId,
          enabled: true,
          instanceUrl: integrations.salesforce.instanceUrl,
          clientId: integrations.salesforce.clientId,
          clientSecretEncrypted: integrations.salesforce.clientSecretEncrypted,
          accessTokenEncrypted: integrations.salesforce.accessTokenEncrypted,
          refreshTokenEncrypted: integrations.salesforce.refreshTokenEncrypted,
        });
        this.adapters.set('salesforce', adapter);
        this.circuitBreakers.set('salesforce', { failures: 0, lastFailure: 0, isOpen: false });
        childLogger.info({ companyId }, 'Salesforce adapter loaded');
      } catch (error) {
        childLogger.error({ error, companyId }, 'Failed to load Salesforce adapter');
      }
    }

    childLogger.info(
      { companyId, adapters: Array.from(this.adapters.keys()) },
      'Integration orchestrator initialized'
    );
  }

  /**
   * Check if circuit breaker is open for an adapter
   */
  private isCircuitOpen(adapterName: string): boolean {
    const state = this.circuitBreakers.get(adapterName);
    if (!state) return false;

    if (!state.isOpen) return false;

    // Check if reset time has passed
    if (state.openedAt && Date.now() - state.openedAt > CIRCUIT_BREAKER_RESET) {
      // Reset circuit breaker (half-open state - allow one request)
      state.isOpen = false;
      state.failures = 0;
      childLogger.info({ adapterName, companyId: this.companyId }, 'Circuit breaker reset');
      return false;
    }

    return true;
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(adapterName: string): void {
    const state = this.circuitBreakers.get(adapterName);
    if (!state) return;

    const now = Date.now();

    // Reset failures if outside window
    if (now - state.lastFailure > CIRCUIT_BREAKER_WINDOW) {
      state.failures = 1;
    } else {
      state.failures++;
    }

    state.lastFailure = now;

    // Open circuit if threshold reached
    if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      state.isOpen = true;
      state.openedAt = now;
      childLogger.warn(
        { adapterName, companyId: this.companyId, failures: state.failures },
        'Circuit breaker opened'
      );
    }
  }

  /**
   * Record success for circuit breaker
   */
  private recordSuccess(adapterName: string): void {
    const state = this.circuitBreakers.get(adapterName);
    if (!state) return;

    state.failures = 0;
    state.isOpen = false;
    state.openedAt = undefined;
  }

  /**
   * Get customer from any available adapter (first match wins)
   */
  async getCustomer(identifier: { email?: string; phone?: string }): Promise<CustomerInfo | null> {
    if (!identifier.email && !identifier.phone) {
      return null;
    }

    for (const [name, adapter] of this.adapters) {
      // Check circuit breaker
      if (this.isCircuitOpen(name)) {
        childLogger.debug({ adapter: name }, 'Skipping adapter - circuit open');
        continue;
      }

      try {
        let customer: CustomerInfo | null = null;

        if (identifier.email) {
          customer = await adapter.getCustomerByEmail(identifier.email);
        }

        if (!customer && identifier.phone) {
          customer = await adapter.getCustomerByPhone(identifier.phone);
        }

        if (customer) {
          this.recordSuccess(name);
          childLogger.debug({ adapter: name, customerId: customer.id }, 'Customer found');
          return customer;
        }
      } catch (error) {
        this.recordFailure(name);
        childLogger.error({ error, adapter: name }, 'Error fetching customer');
      }
    }

    return null;
  }

  /**
   * Sync call record to all enabled adapters
   */
  async syncCallEnd(
    callId: string,
    summary: string,
    options?: {
      transcript?: string;
      duration?: number;
      callerPhone?: string;
      sentiment?: 'positive' | 'neutral' | 'negative';
      outcome?: string;
      recordingUrl?: string;
    }
  ): Promise<Array<{ adapter: string; id: string; url?: string; error?: string }>> {
    const input: SyncCallRecordInput = {
      callId,
      summary,
      ...options,
    };

    const results: Array<{ adapter: string; id: string; url?: string; error?: string }> = [];

    // Sync to all adapters in parallel
    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      // Check circuit breaker
      if (this.isCircuitOpen(name)) {
        return { adapter: name, id: '', error: 'Circuit breaker open' };
      }

      try {
        const result = await adapter.syncCallRecord(input);
        this.recordSuccess(name);
        return { adapter: name, id: result.id, url: result.url };
      } catch (error) {
        this.recordFailure(name);
        return { adapter: name, id: '', error: (error as Error).message };
      }
    });

    const promiseResults = await Promise.all(promises);
    results.push(...promiseResults);

    childLogger.info(
      { callId, companyId: this.companyId, results: results.map((r) => ({ adapter: r.adapter, success: !!r.id })) },
      'Call record synced to integrations'
    );

    return results;
  }

  /**
   * Get specific adapter by name
   */
  getAdapter(name: string): IntegrationAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all enabled adapter names
   */
  getEnabledAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get health status of all adapters
   */
  getAllHealth(): Record<string, IntegrationHealth & { circuitOpen: boolean }> {
    const health: Record<string, IntegrationHealth & { circuitOpen: boolean }> = {};

    for (const [name, adapter] of this.adapters) {
      health[name] = {
        ...adapter.getHealth(),
        circuitOpen: this.isCircuitOpen(name),
      };
    }

    return health;
  }

  /**
   * Test all adapter connections
   */
  async testAllConnections(): Promise<Record<string, { ok: boolean; error?: string }>> {
    const results: Record<string, { ok: boolean; error?: string }> = {};

    const promises = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      const result = await adapter.testConnection();
      return { name, result };
    });

    const promiseResults = await Promise.all(promises);

    for (const { name, result } of promiseResults) {
      results[name] = result;
    }

    return results;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    for (const [name, adapter] of this.adapters) {
      if ('destroy' in adapter && typeof adapter.destroy === 'function') {
        (adapter as SalesforceAdapter).destroy();
      }
    }
    this.adapters.clear();
    this.circuitBreakers.clear();
  }
}

export default IntegrationOrchestrator;
