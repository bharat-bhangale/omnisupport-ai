import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import crypto from 'crypto';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Company } from '../models/Company.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();
const childLogger = logger.child({ route: 'settings' });

// Initialize Stripe
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

// Initialize S3
const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Auth0 Management API base URL
const AUTH0_API_BASE = `https://${env.AUTH0_DOMAIN}/api/v2`;

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
    email?: string;
  };
}

// Validation schemas
const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  industry: z.string().max(100).optional(),
  timezone: z.string().max(50).optional(),
  primaryLanguage: z.string().max(10).optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['agent', 'manager', 'admin']),
});

const updateRoleSchema = z.object({
  role: z.enum(['agent', 'manager', 'admin']),
});

const updateSecuritySchema = z.object({
  twoFactorRequired: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(480).optional(),
  dataRetentionDays: z.number().int().min(30).max(365).optional(),
});

// Helper to verify admin role
function requireAdmin(req: AuthRequest): void {
  if (req.user?.role !== 'admin') {
    throw AppError.forbidden('Admin access required');
  }
}

// Helper to get company
async function getCompany(companyId: string) {
  const company = await Company.findById(companyId);
  if (!company) {
    throw AppError.notFound('Company');
  }
  return company;
}

// Helper to get Auth0 Management API token
async function getAuth0Token(): Promise<string> {
  if (env.AUTH0_MGMT_API_TOKEN) {
    return env.AUTH0_MGMT_API_TOKEN;
  }

  const response = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      audience: `https://${env.AUTH0_DOMAIN}/api/v2/`,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw AppError.externalService('Auth0', new Error('Failed to get management token'));
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// Helper to mask API key
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// Helper to generate API key
function generateApiKey(): string {
  return 'sk_' + crypto.randomBytes(24).toString('hex');
}

// Helper to hash API key
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// ==================== COMPANY ROUTES ====================

/**
 * GET /settings/company - Get company profile (sanitized)
 */
router.get(
  '/company',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const company = await getCompany(companyId);

    res.json({
      success: true,
      company: {
        id: company._id,
        name: company.name,
        slug: company.slug,
        industry: company.industry,
        timezone: company.settings.timezone,
        primaryLanguage: company.primaryLanguage,
        logoUrl: company.logoUrl,
        tier: company.tier,
        createdAt: company.createdAt,
      },
    });
  })
);

/**
 * PUT /settings/company - Update company profile
 */
router.put(
  '/company',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const updates = updateCompanySchema.parse(req.body);

    const company = await getCompany(companyId);

    if (updates.name) company.name = updates.name;
    if (updates.industry) company.industry = updates.industry;
    if (updates.timezone) company.settings.timezone = updates.timezone;
    if (updates.primaryLanguage) company.primaryLanguage = updates.primaryLanguage;

    await company.save();

    childLogger.info({ companyId }, 'Company profile updated');

    res.json({
      success: true,
      message: 'Company profile updated',
      company: {
        id: company._id,
        name: company.name,
        industry: company.industry,
        timezone: company.settings.timezone,
        primaryLanguage: company.primaryLanguage,
      },
    });
  })
);

/**
 * POST /settings/company/logo - Upload company logo
 */
router.post(
  '/company/logo',
  upload.single('logo'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const file = req.file;

    if (!file) {
      throw AppError.badRequest('No file uploaded');
    }

    const key = `logos/${companyId}/${Date.now()}-${file.originalname}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      })
    );

    const logoUrl = `https://${env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;

    await Company.findByIdAndUpdate(companyId, { logoUrl });

    childLogger.info({ companyId, logoUrl }, 'Company logo updated');

    res.json({
      success: true,
      logoUrl,
    });
  })
);

// ==================== TEAM ROUTES ====================

/**
 * GET /settings/team - List team members
 */
router.get(
  '/team',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const token = await getAuth0Token();

    const response = await fetch(
      `${AUTH0_API_BASE}/users?q=app_metadata.companyId:"${companyId}"&search_engine=v3`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw AppError.externalService('Auth0', new Error('Failed to fetch users'));
    }

    const users = await response.json() as Array<{
      user_id: string;
      email: string;
      name: string;
      picture: string;
      app_metadata?: { role?: string; companyId?: string };
      last_login?: string;
      created_at: string;
      email_verified: boolean;
    }>;

    const members = users.map((user) => ({
      id: user.user_id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      avatar: user.picture,
      role: user.app_metadata?.role || 'agent',
      status: user.email_verified ? 'active' : 'pending',
      lastActive: user.last_login,
      createdAt: user.created_at,
    }));

    res.json({
      success: true,
      members,
      total: members.length,
    });
  })
);

/**
 * POST /settings/team/invite - Invite a new team member
 */
router.post(
  '/team/invite',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const { email, role } = inviteUserSchema.parse(req.body);

    const token = await getAuth0Token();

    // Create user in Auth0
    const createResponse = await fetch(`${AUTH0_API_BASE}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        connection: 'Username-Password-Authentication',
        password: crypto.randomBytes(16).toString('hex') + 'Aa1!',
        app_metadata: {
          companyId,
          role,
        },
        verify_email: true,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      childLogger.error({ email, error }, 'Failed to create user in Auth0');
      throw AppError.externalService('Auth0', new Error(error));
    }

    const user = await createResponse.json() as { user_id: string; email: string };

    // Send password reset email (acts as invitation)
    await fetch(`${AUTH0_API_BASE}/tickets/password-change`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.user_id,
        result_url: `${env.SERVER_URL}/login`,
      }),
    });

    childLogger.info({ companyId, email, role }, 'Team member invited');

    res.json({
      success: true,
      message: 'Invitation sent',
      user: {
        id: user.user_id,
        email: user.email,
        role,
        status: 'pending',
      },
    });
  })
);

/**
 * PATCH /settings/team/:userId/role - Update team member role
 */
router.patch(
  '/team/:userId/role',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const { userId } = req.params;
    const { role } = updateRoleSchema.parse(req.body);

    const token = await getAuth0Token();

    // Verify user belongs to company
    const getUserResponse = await fetch(`${AUTH0_API_BASE}/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!getUserResponse.ok) {
      throw AppError.notFound('User');
    }

    const user = await getUserResponse.json() as { app_metadata?: { companyId?: string } };
    if (user.app_metadata?.companyId !== companyId) {
      throw AppError.forbidden('User does not belong to your company');
    }

    // Update role
    const updateResponse = await fetch(`${AUTH0_API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_metadata: { role },
      }),
    });

    if (!updateResponse.ok) {
      throw AppError.externalService('Auth0', new Error('Failed to update user role'));
    }

    childLogger.info({ companyId, userId, role }, 'Team member role updated');

    res.json({
      success: true,
      message: 'Role updated',
    });
  })
);

/**
 * DELETE /settings/team/:userId - Remove team member
 */
router.delete(
  '/team/:userId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user!.sub) {
      throw AppError.badRequest('Cannot remove yourself');
    }

    const token = await getAuth0Token();

    // Verify user belongs to company
    const getUserResponse = await fetch(`${AUTH0_API_BASE}/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!getUserResponse.ok) {
      throw AppError.notFound('User');
    }

    const user = await getUserResponse.json() as { app_metadata?: { companyId?: string } };
    if (user.app_metadata?.companyId !== companyId) {
      throw AppError.forbidden('User does not belong to your company');
    }

    // Delete user
    const deleteResponse = await fetch(`${AUTH0_API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!deleteResponse.ok) {
      throw AppError.externalService('Auth0', new Error('Failed to delete user'));
    }

    childLogger.info({ companyId, userId }, 'Team member removed');

    res.json({
      success: true,
      message: 'Team member removed',
    });
  })
);

// ==================== BILLING ROUTES ====================

/**
 * GET /settings/billing - Get billing information
 */
router.get(
  '/billing',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    if (!stripe) {
      throw AppError.serviceUnavailable('Billing service');
    }

    let invoices: Array<{
      id: string;
      date: string;
      amount: number;
      status: string;
      pdfUrl?: string;
    }> = [];
    let paymentMethod: { brand?: string; last4?: string; expMonth?: number; expYear?: number } | null = null;
    let subscription: { nextChargeDate?: string; nextChargeAmount?: number } | null = null;

    if (company.billing.stripeCustomerId) {
      // Fetch invoices
      const stripeInvoices = await stripe.invoices.list({
        customer: company.billing.stripeCustomerId,
        limit: 10,
      });

      invoices = stripeInvoices.data.map((inv) => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_due / 100,
        status: inv.status || 'unknown',
        pdfUrl: inv.invoice_pdf || undefined,
      }));

      // Fetch payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: company.billing.stripeCustomerId,
        type: 'card',
      });

      if (paymentMethods.data.length > 0) {
        const card = paymentMethods.data[0].card;
        paymentMethod = {
          brand: card?.brand,
          last4: card?.last4,
          expMonth: card?.exp_month,
          expYear: card?.exp_year,
        };
      }

      // Fetch subscription
      if (company.billing.stripeSubscriptionId) {
        const sub = await stripe.subscriptions.retrieve(company.billing.stripeSubscriptionId);
        subscription = {
          nextChargeDate: new Date(sub.current_period_end * 1000).toISOString(),
          nextChargeAmount: sub.items.data[0]?.price.unit_amount ? sub.items.data[0].price.unit_amount / 100 : undefined,
        };
      }
    }

    res.json({
      success: true,
      billing: {
        plan: company.billing.plan || company.tier,
        status: company.billing.status,
        nextChargeDate: subscription?.nextChargeDate || company.billing.currentPeriodEnd,
        nextChargeAmount: subscription?.nextChargeAmount,
        cancelAtPeriodEnd: company.billing.cancelAtPeriodEnd,
        usage: {
          minutes: {
            used: company.usage.currentMonthMinutes,
            limit: company.limits.monthlyMinutes,
          },
          tickets: {
            used: company.usage.currentMonthTickets,
            limit: company.limits.monthlyTickets,
          },
        },
        paymentMethod,
        invoices,
      },
    });
  })
);

/**
 * POST /settings/billing/create-portal - Create Stripe billing portal session
 */
router.post(
  '/billing/create-portal',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    if (!stripe) {
      throw AppError.serviceUnavailable('Billing service');
    }

    if (!company.billing.stripeCustomerId) {
      throw AppError.badRequest('No billing account found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.billing.stripeCustomerId,
      return_url: `${env.SERVER_URL}/settings?tab=billing`,
    });

    res.json({
      success: true,
      url: session.url,
    });
  })
);

/**
 * POST /settings/billing/webhook - Stripe webhook handler
 */
router.post(
  '/billing/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      throw AppError.serviceUnavailable('Billing service');
    }

    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      childLogger.error({ error: err }, 'Stripe webhook signature verification failed');
      throw AppError.badRequest('Invalid webhook signature');
    }

    childLogger.info({ type: event.type }, 'Stripe webhook received');

    switch (event.type) {
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const company = await Company.findOne({ 'billing.stripeCustomerId': customerId });
        if (company) {
          // Map Stripe price to plan tier
          const priceId = subscription.items.data[0]?.price.id;
          let plan: 'starter' | 'growth' | 'enterprise' = 'starter';
          if (priceId?.includes('growth')) plan = 'growth';
          if (priceId?.includes('enterprise')) plan = 'enterprise';

          company.billing.plan = plan;
          company.billing.status = subscription.status === 'active' ? 'active' : 'past_due';
          company.billing.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          company.billing.cancelAtPeriodEnd = subscription.cancel_at_period_end;
          company.tier = plan;
          await company.save();

          childLogger.info({ companyId: company._id, plan }, 'Subscription updated');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const company = await Company.findOne({ 'billing.stripeCustomerId': customerId });
        if (company) {
          company.billing.status = 'past_due';
          await company.save();

          // TODO: Send email alert via SendGrid
          childLogger.warn({ companyId: company._id }, 'Payment failed');
        }
        break;
      }
    }

    res.json({ received: true });
  })
);

// ==================== API KEYS ROUTES ====================

/**
 * GET /settings/api-keys - Get masked API keys
 */
router.get(
  '/api-keys',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    res.json({
      success: true,
      apiKeys: {
        publicKey: company.apiKeys?.publicKey || null,
        secretKey: company.apiKeys?.secretKeyHash ? '****' + company.apiKeys.publicKey?.slice(-4) : null,
        webhookSecret: company.apiKeys?.webhookSecret ? maskApiKey(company.apiKeys.webhookSecret) : null,
        lastRotatedAt: company.apiKeys?.lastRotatedAt,
      },
    });
  })
);

/**
 * POST /settings/api-keys/regenerate - Regenerate API keys
 */
router.post(
  '/api-keys/regenerate',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const company = await getCompany(companyId);

    const newSecretKey = generateApiKey();
    const newWebhookSecret = 'whsec_' + crypto.randomBytes(24).toString('hex');

    company.apiKeys = {
      publicKey: 'pk_' + crypto.randomBytes(16).toString('hex'),
      secretKeyHash: hashApiKey(newSecretKey),
      webhookSecret: newWebhookSecret,
      lastRotatedAt: new Date(),
    };

    await company.save();

    childLogger.info({ companyId }, 'API keys regenerated');

    // Return the actual secret key ONLY on regeneration
    res.json({
      success: true,
      message: 'API keys regenerated. Save your secret key now - it will not be shown again.',
      apiKeys: {
        publicKey: company.apiKeys.publicKey,
        secretKey: newSecretKey, // Only shown once
        webhookSecret: newWebhookSecret,
      },
    });
  })
);

// ==================== SECURITY ROUTES ====================

/**
 * PUT /settings/security - Update security settings
 */
router.put(
  '/security',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const updates = updateSecuritySchema.parse(req.body);

    const company = await getCompany(companyId);

    if (updates.twoFactorRequired !== undefined) {
      company.security.twoFactorRequired = updates.twoFactorRequired;
    }
    if (updates.sessionTimeoutMinutes !== undefined) {
      company.security.sessionTimeoutMinutes = updates.sessionTimeoutMinutes;
    }
    if (updates.dataRetentionDays !== undefined) {
      company.security.dataRetentionDays = updates.dataRetentionDays;
    }

    await company.save();

    childLogger.info({ companyId, updates }, 'Security settings updated');

    res.json({
      success: true,
      security: company.security,
    });
  })
);

/**
 * POST /settings/export-data - GDPR data export
 */
router.post(
  '/export-data',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireAdmin(req);

    const companyId = req.user!.companyId;
    const userEmail = req.user!.email;

    if (!userEmail) {
      throw AppError.badRequest('User email required for data export');
    }

    // Queue the export job
    // Import dynamically to avoid circular dependencies
    const { default: Bull } = await import('bullmq');
    const redisUrl = new URL(env.UPSTASH_REDIS_URL);
    
    const exportQueue = new Bull.Queue('data-export', {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: env.UPSTASH_REDIS_TOKEN,
        tls: {},
      },
    });

    await exportQueue.add('export', {
      companyId,
      requestedBy: req.user!.sub,
      email: userEmail,
      requestedAt: new Date().toISOString(),
    });

    await exportQueue.close();

    childLogger.info({ companyId, userEmail }, 'Data export queued');

    res.json({
      success: true,
      message: 'Data export initiated. You will receive an email with a download link when ready.',
    });
  })
);

export default router;
