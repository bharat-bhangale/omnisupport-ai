// ============================================================================
// EMAIL TEMPLATES
// ============================================================================
// Pre-built email templates for workflow automation

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[]; // List of available variables
}

/**
 * Email templates for workflow automation
 */
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  // ============================================================================
  // P1 Acknowledgment
  // ============================================================================
  ack_p1: {
    id: 'ack_p1',
    name: 'P1 Acknowledgment',
    subject: 'We received your urgent request — #{ticketId}',
    bodyHtml: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
    .priority-badge { display: inline-block; background: #fef2f2; color: #dc2626; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🚨 Urgent Request Received</h1>
    </div>
    <div class="content">
      <p>Hi {customerName},</p>
      <p>We received your urgent support request and our team is on it:</p>
      <p><strong>Subject:</strong> {subject}</p>
      <p><span class="priority-badge">Priority: Urgent</span></p>
      <p>Given the priority level, a senior specialist has been assigned to your case. You can expect an update within the next hour.</p>
      <p>If you have additional information to share, please reply to this email or reference ticket <strong>#{ticketId}</strong>.</p>
      <p>Best regards,<br>The Support Team</p>
    </div>
    <div class="footer">
      <p>Ticket ID: #{ticketId} | This is an automated message</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    bodyText: `
Hi {customerName},

We received your urgent support request and our team is on it.

Subject: {subject}
Priority: Urgent

Given the priority level, a senior specialist has been assigned to your case. You can expect an update within the next hour.

If you have additional information to share, please reply to this email or reference ticket #{ticketId}.

Best regards,
The Support Team

---
Ticket ID: #{ticketId}
    `.trim(),
    variables: ['customerName', 'subject', 'ticketId', 'priority'],
  },

  // ============================================================================
  // SLA Breach Alert
  // ============================================================================
  sla_breach: {
    id: 'sla_breach',
    name: 'SLA Breach Alert',
    subject: '⚠️ Action Required: SLA breach on ticket #{ticketId}',
    bodyHtml: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #fffbeb; padding: 20px; border: 1px solid #fcd34d; }
    .alert-box { background: #dc2626; color: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .details { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚠️ SLA Breach Alert</h1>
    </div>
    <div class="content">
      <div class="alert-box">
        <strong>IMMEDIATE ACTION REQUIRED</strong>
        <p style="margin: 10px 0 0 0;">Response SLA has been breached for ticket #{ticketId}</p>
      </div>
      
      <div class="details">
        <h3 style="margin-top: 0;">Ticket Details</h3>
        <p><strong>Subject:</strong> {subject}</p>
        <p><strong>Priority:</strong> {priority}</p>
        <p><strong>Customer:</strong> {customerName}</p>
        <p><strong>Created:</strong> {createdAt}</p>
        <p><strong>SLA Deadline:</strong> {slaDeadline}</p>
      </div>

      <p>Please take immediate action to respond to this ticket.</p>
      <p><a href="{ticketUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Ticket →</a></p>
    </div>
    <div class="footer">
      <p>This is an automated SLA monitoring alert</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    bodyText: `
⚠️ SLA BREACH ALERT

IMMEDIATE ACTION REQUIRED
Response SLA has been breached for ticket #{ticketId}

TICKET DETAILS:
- Subject: {subject}
- Priority: {priority}
- Customer: {customerName}
- Created: {createdAt}
- SLA Deadline: {slaDeadline}

Please take immediate action to respond to this ticket.

View ticket: {ticketUrl}

---
This is an automated SLA monitoring alert
    `.trim(),
    variables: ['ticketId', 'subject', 'priority', 'customerName', 'createdAt', 'slaDeadline', 'ticketUrl'],
  },

  // ============================================================================
  // After Hours Acknowledgment
  // ============================================================================
  after_hours_ack: {
    id: 'after_hours_ack',
    name: 'After Hours Acknowledgment',
    subject: 'We received your request — #{ticketId}',
    bodyHtml: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6366f1; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">📬 Request Received</h1>
    </div>
    <div class="content">
      <p>Hi {customerName},</p>
      <p>Thank you for contacting us. We received your support request:</p>
      <p><strong>Subject:</strong> {subject}</p>
      <p>Your request was received outside our regular business hours. Our team will review your ticket first thing when we're back online.</p>
      <p><strong>Business Hours:</strong> Monday - Friday, 9 AM - 6 PM EST</p>
      <p>If this is urgent, please reply with "URGENT" and we'll prioritize your request.</p>
      <p>Thank you for your patience!</p>
      <p>Best regards,<br>The Support Team</p>
    </div>
    <div class="footer">
      <p>Ticket ID: #{ticketId}</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    bodyText: `
Hi {customerName},

Thank you for contacting us. We received your support request:

Subject: {subject}

Your request was received outside our regular business hours. Our team will review your ticket first thing when we're back online.

Business Hours: Monday - Friday, 9 AM - 6 PM EST

If this is urgent, please reply with "URGENT" and we'll prioritize your request.

Thank you for your patience!

Best regards,
The Support Team

---
Ticket ID: #{ticketId}
    `.trim(),
    variables: ['customerName', 'subject', 'ticketId'],
  },

  // ============================================================================
  // Escalation Notification (for managers)
  // ============================================================================
  escalation_notice: {
    id: 'escalation_notice',
    name: 'Escalation Notice',
    subject: '🔺 Ticket Escalated — #{ticketId}',
    bodyHtml: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f5f3ff; padding: 20px; border: 1px solid #c4b5fd; }
    .details { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🔺 Ticket Escalated</h1>
    </div>
    <div class="content">
      <p>A ticket has been escalated and requires your attention:</p>
      
      <div class="details">
        <p><strong>Ticket:</strong> #{ticketId}</p>
        <p><strong>Subject:</strong> {subject}</p>
        <p><strong>Customer:</strong> {customerName}</p>
        <p><strong>Priority:</strong> {priority}</p>
        <p><strong>Escalation Reason:</strong> {escalationReason}</p>
      </div>

      <p><a href="{ticketUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Review Ticket →</a></p>
    </div>
    <div class="footer">
      <p>This is an automated escalation notification</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    bodyText: `
🔺 TICKET ESCALATED

A ticket has been escalated and requires your attention:

Ticket: #{ticketId}
Subject: {subject}
Customer: {customerName}
Priority: {priority}
Escalation Reason: {escalationReason}

Review ticket: {ticketUrl}

---
This is an automated escalation notification
    `.trim(),
    variables: ['ticketId', 'subject', 'customerName', 'priority', 'escalationReason', 'ticketUrl'],
  },
};

/**
 * Get email template by ID
 */
export function getEmailTemplate(templateId: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES[templateId];
}

/**
 * Interpolate template variables with actual values
 */
export function interpolateEmailTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_, path) => {
    // Handle nested paths like {customer.name}
    const value = path.split('.').reduce((obj: unknown, key: string) => {
      if (obj && typeof obj === 'object' && key in obj) {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, variables);
    
    return value !== undefined ? String(value) : `{${path}}`;
  });
}

/**
 * Render full email from template
 */
export function renderEmail(
  templateId: string,
  variables: Record<string, unknown>,
  format: 'html' | 'text' = 'html'
): { subject: string; body: string } | null {
  const template = getEmailTemplate(templateId);
  if (!template) return null;

  return {
    subject: interpolateEmailTemplate(template.subject, variables),
    body: interpolateEmailTemplate(
      format === 'html' ? template.bodyHtml : template.bodyText,
      variables
    ),
  };
}
