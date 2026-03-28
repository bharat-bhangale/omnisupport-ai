import type { ITicket } from '../models/Ticket.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'slaCalculator' });

/**
 * SLA Policy configuration per priority
 */
export interface SLAPolicy {
  P1: { responseMinutes: number; resolutionHours: number };
  P2: { responseMinutes: number; resolutionHours: number };
  P3: { responseMinutes: number; resolutionHours: number };
  P4: { responseMinutes: number; resolutionHours: number };
}

/**
 * Default SLA policy if company doesn't have custom settings
 */
export const DEFAULT_SLA_POLICY: SLAPolicy = {
  P1: { responseMinutes: 15, resolutionHours: 4 },   // Urgent
  P2: { responseMinutes: 60, resolutionHours: 8 },   // High
  P3: { responseMinutes: 240, resolutionHours: 24 }, // Normal
  P4: { responseMinutes: 480, resolutionHours: 48 }, // Low
};

/**
 * Map internal priority to P-notation
 */
function priorityToP(priority: string): keyof SLAPolicy {
  const map: Record<string, keyof SLAPolicy> = {
    urgent: 'P1',
    high: 'P2',
    normal: 'P3',
    low: 'P4',
  };
  return map[priority] || 'P3';
}

/**
 * SLA status based on time remaining
 */
export type SLAStatus = 'compliant' | 'warning' | 'critical' | 'breached';

/**
 * Company interface for SLA (simplified for this service)
 */
export interface CompanySLA {
  slaPolicy?: SLAPolicy;
}

/**
 * Calculate SLA deadlines for a ticket
 * @param ticket - The ticket to calculate deadlines for
 * @param company - Company with SLA policy
 * @returns Object with responseDeadline and resolutionDeadline
 */
export function calculateSLADeadline(
  ticket: ITicket,
  company?: CompanySLA
): { responseDeadline: Date; resolutionDeadline: Date } {
  const slaPolicy = company?.slaPolicy || DEFAULT_SLA_POLICY;
  const priorityKey = priorityToP(ticket.priority);
  const policy = slaPolicy[priorityKey];

  const createdAt = ticket.createdAt instanceof Date
    ? ticket.createdAt.getTime()
    : new Date(ticket.createdAt).getTime();

  const responseDeadline = new Date(createdAt + policy.responseMinutes * 60 * 1000);
  const resolutionDeadline = new Date(createdAt + policy.resolutionHours * 60 * 60 * 1000);

  childLogger.debug(
    {
      ticketId: ticket._id?.toString(),
      priority: ticket.priority,
      priorityKey,
      responseMinutes: policy.responseMinutes,
      responseDeadline: responseDeadline.toISOString(),
    },
    'Calculated SLA deadlines'
  );

  return { responseDeadline, resolutionDeadline };
}

/**
 * Get SLA status based on time remaining until response deadline
 * @param ticket - The ticket to check
 * @returns SLA status: 'compliant', 'warning', 'critical', or 'breached'
 */
export function getSLAStatus(ticket: ITicket): SLAStatus {
  if (!ticket.sla?.responseDeadline) {
    return 'compliant'; // No deadline set
  }

  const deadline = ticket.sla.responseDeadline instanceof Date
    ? ticket.sla.responseDeadline.getTime()
    : new Date(ticket.sla.responseDeadline).getTime();

  const timeToBreachMs = deadline - Date.now();

  // Already breached
  if (timeToBreachMs <= 0) {
    return 'breached';
  }

  // Critical: less than 30 minutes
  if (timeToBreachMs <= 1800000) {
    return 'critical';
  }

  // Warning: 30 minutes to 1 hour
  if (timeToBreachMs <= 3600000) {
    return 'warning';
  }

  // Compliant: more than 1 hour
  return 'compliant';
}

/**
 * Calculate time remaining until SLA breach in milliseconds
 * @param ticket - The ticket to check
 * @returns Time to breach in milliseconds (negative if already breached)
 */
export function getTimeToBreachMs(ticket: ITicket): number | null {
  if (!ticket.sla?.responseDeadline) {
    return null;
  }

  const deadline = ticket.sla.responseDeadline instanceof Date
    ? ticket.sla.responseDeadline.getTime()
    : new Date(ticket.sla.responseDeadline).getTime();

  return deadline - Date.now();
}

/**
 * Check if a ticket is at risk of SLA breach
 * @param ticket - The ticket to check
 * @returns True if status is 'warning' or 'critical'
 */
export function isAtRisk(ticket: ITicket): boolean {
  const status = getSLAStatus(ticket);
  return status === 'warning' || status === 'critical';
}

/**
 * Format time to breach for display
 * @param timeMs - Time in milliseconds
 * @returns Human-readable string
 */
export function formatTimeToBreachDisplay(timeMs: number): string {
  if (timeMs <= 0) {
    const overdue = Math.abs(timeMs);
    const minutes = Math.floor(overdue / 60000);
    if (minutes < 60) {
      return `${minutes}m overdue`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m overdue`;
  }

  const minutes = Math.floor(timeMs / 60000);
  if (minutes < 60) {
    return `${minutes}m remaining`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m remaining`;
}

/**
 * Get minutes until breach (for socket events)
 */
export function getMinutesUntilBreach(ticket: ITicket): number {
  const timeMs = getTimeToBreachMs(ticket);
  if (timeMs === null || timeMs <= 0) {
    return 0;
  }
  return Math.floor(timeMs / 60000);
}
