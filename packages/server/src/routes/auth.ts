import { Router, Response } from 'express';
import { z } from 'zod';
import { Company } from '../models/Company.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const router = Router();
const childLogger = logger.child({ route: 'auth' });

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /auth/me - Get current user and company info
 */
router.get(
  '/me',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId, companyId, role, email, name } = req.user;

    // Fetch company details
    const company = await Company.findById(companyId)
      .select('name slug tier voiceConfig.agentName textConfig integrations.slack.configured')
      .lean();

    if (!company) {
      throw AppError.notFound('Company');
    }

    res.json({
      success: true,
      user: {
        id: userId,
        email,
        name,
        role,
        companyId,
      },
      company: {
        id: company._id,
        name: company.name,
        slug: company.slug,
        tier: company.tier,
        agentName: company.voiceConfig?.agentName,
        features: {
          voice: true,
          text: true,
          analytics: company.tier !== 'starter',
          customWorkflows: company.tier === 'enterprise',
          sso: company.tier === 'enterprise',
        },
      },
    });
  })
);

/**
 * POST /auth/invite - Invite a new team member
 * Admin only - creates user in Auth0 and sends invite email
 */
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['agent', 'manager']),
  name: z.string().min(1).max(100).optional(),
});

router.post(
  '/invite',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const data = inviteSchema.parse(req.body);

    // Check if Auth0 Management API token is configured
    if (!env.AUTH0_MGMT_API_TOKEN) {
      throw AppError.serviceUnavailable('User invitation service');
    }

    // Get company for context
    const company = await Company.findById(companyId).select('name slug').lean();
    if (!company) {
      throw AppError.notFound('Company');
    }

    // Create user in Auth0 using Management API
    const auth0Response = await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AUTH0_MGMT_API_TOKEN}`,
      },
      body: JSON.stringify({
        email: data.email,
        name: data.name || data.email.split('@')[0],
        connection: 'Username-Password-Authentication',
        password: generateTempPassword(),
        verify_email: false, // We'll send our own invite
        app_metadata: {
          company_id: companyId,
          role: data.role,
        },
        user_metadata: {
          invited_by: req.user.userId,
          company_name: company.name,
        },
      }),
    });

    if (!auth0Response.ok) {
      const error = await auth0Response.json();
      childLogger.error({ error, email: data.email }, 'Auth0 user creation failed');

      if (error.statusCode === 409) {
        throw AppError.conflict('A user with this email already exists');
      }

      throw AppError.externalService('Auth0');
    }

    const auth0User = await auth0Response.json();

    // Send password reset email (acts as invite)
    const resetResponse = await fetch(
      `https://${env.AUTH0_DOMAIN}/api/v2/tickets/password-change`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AUTH0_MGMT_API_TOKEN}`,
        },
        body: JSON.stringify({
          user_id: auth0User.user_id,
          result_url: `${env.SERVER_URL}/login?invited=true`,
          mark_email_as_verified: true,
        }),
      }
    );

    if (!resetResponse.ok) {
      childLogger.error({ userId: auth0User.user_id }, 'Failed to send invite email');
      // Don't fail the request - user was created successfully
    }

    childLogger.info(
      { invitedEmail: data.email, role: data.role, invitedBy: req.user.userId },
      'User invited successfully'
    );

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${data.email}`,
      user: {
        id: auth0User.user_id,
        email: data.email,
        role: data.role,
        status: 'pending',
      },
    });
  })
);

/**
 * GET /auth/team - List team members (admin/manager only)
 */
router.get(
  '/team',
  roleGuard('manager', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;

    if (!env.AUTH0_MGMT_API_TOKEN) {
      throw AppError.serviceUnavailable('Team management service');
    }

    // Search Auth0 for users in this company
    const searchParams = new URLSearchParams({
      q: `app_metadata.company_id:"${companyId}"`,
      search_engine: 'v3',
    });

    const response = await fetch(
      `https://${env.AUTH0_DOMAIN}/api/v2/users?${searchParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${env.AUTH0_MGMT_API_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw AppError.externalService('Auth0');
    }

    const users = await response.json();

    res.json({
      success: true,
      team: users.map((user: {
        user_id: string;
        email: string;
        name: string;
        picture: string;
        app_metadata?: { role: string };
        last_login?: string;
        created_at: string;
        email_verified: boolean;
      }) => ({
        id: user.user_id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.app_metadata?.role || 'agent',
        lastLogin: user.last_login,
        createdAt: user.created_at,
        status: user.email_verified ? 'active' : 'pending',
      })),
    });
  })
);

/**
 * PATCH /auth/team/:userId/role - Update team member role (admin only)
 */
const updateRoleSchema = z.object({
  role: z.enum(['agent', 'manager']),
});

router.patch(
  '/team/:userId/role',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;
    const data = updateRoleSchema.parse(req.body);

    if (!env.AUTH0_MGMT_API_TOKEN) {
      throw AppError.serviceUnavailable('Team management service');
    }

    // Cannot change own role
    if (userId === req.user.userId) {
      throw AppError.badRequest('Cannot change your own role');
    }

    // Update user's app_metadata in Auth0
    const response = await fetch(
      `https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AUTH0_MGMT_API_TOKEN}`,
        },
        body: JSON.stringify({
          app_metadata: {
            role: data.role,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      if (error.statusCode === 404) {
        throw AppError.notFound('User');
      }
      throw AppError.externalService('Auth0');
    }

    childLogger.info(
      { targetUserId: userId, newRole: data.role, updatedBy: req.user.userId },
      'User role updated'
    );

    res.json({
      success: true,
      message: `User role updated to ${data.role}`,
    });
  })
);

/**
 * DELETE /auth/team/:userId - Remove team member (admin only)
 */
router.delete(
  '/team/:userId',
  roleGuard('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;

    if (!env.AUTH0_MGMT_API_TOKEN) {
      throw AppError.serviceUnavailable('Team management service');
    }

    // Cannot remove self
    if (userId === req.user.userId) {
      throw AppError.badRequest('Cannot remove yourself');
    }

    // Delete user from Auth0
    const response = await fetch(
      `https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${env.AUTH0_MGMT_API_TOKEN}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      const error = await response.json();
      if (error.statusCode === 404) {
        throw AppError.notFound('User');
      }
      throw AppError.externalService('Auth0');
    }

    childLogger.info(
      { removedUserId: userId, removedBy: req.user.userId },
      'User removed from team'
    );

    res.json({
      success: true,
      message: 'User removed from team',
    });
  })
);

/**
 * Generate a secure temporary password
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default router;
