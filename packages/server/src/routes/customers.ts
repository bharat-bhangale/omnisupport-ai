import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Customer } from '../models/Customer.js';
import {
  buildCustomerCard,
  getCustomerProfile,
  buildSentimentTimeline,
  invalidateCustomerCard,
} from '../services/customerIntelligence.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import type {
  CustomerListQuery,
  CustomerListResponse,
  CustomerListItem,
  CustomerUpdatePayload,
  CustomerSearchResult,
  AtRiskCustomer,
} from '../types/customer.js';

const router = Router();
const childLogger = logger.child({ route: 'customers' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Validation schemas
const listQuerySchema = z.object({
  tier: z.enum(['standard', 'premium', 'vip', 'enterprise']).optional(),
  churnRisk: z.enum(['low', 'medium', 'high']).optional(),
  lastContact: z.enum(['today', 'week', 'month', 'quarter']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'lifetimeValue', 'churnRiskScore', 'lastContactDate']).default('lastContactDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const updateSchema = z.object({
  tier: z.enum(['standard', 'premium', 'vip', 'enterprise']).optional(),
  notes: z.string().max(2000).optional(),
  knownIssues: z.array(z.string().max(200)).max(10).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  preferredStyle: z.enum(['formal', 'casual', 'technical']).optional(),
  verbosity: z.enum(['concise', 'detailed']).optional(),
  preferredLanguage: z.string().length(2).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /customers - Paginated list with filters
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const query = listQuerySchema.parse(req.query);
    const { tier, churnRisk, lastContact, page, limit, sortBy, sortOrder } = query;

    // Build MongoDB filter
    const filter: Record<string, unknown> = { companyId };

    if (tier) {
      filter.tier = tier;
    }

    // Last contact filter
    if (lastContact) {
      const now = new Date();
      let cutoff: Date;
      switch (lastContact) {
        case 'today':
          cutoff = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
      }
      filter.lastContactAt = { $gte: cutoff };
    }

    // Churn risk filter (requires aggregation or stored field)
    if (churnRisk) {
      switch (churnRisk) {
        case 'high':
          filter.churnRiskScore = { $gte: 0.65 };
          break;
        case 'medium':
          filter.churnRiskScore = { $gte: 0.4, $lt: 0.65 };
          break;
        case 'low':
          filter.churnRiskScore = { $lt: 0.4 };
          break;
      }
    }

    // Build sort
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    const items: CustomerListItem[] = customers.map((c) => ({
      id: c._id.toString(),
      name: c.name || 'Unknown',
      email: c.email,
      phone: c.phone,
      tier: c.tier || 'standard',
      lifetimeValue: c.lifetimeValue || 0,
      churnRiskScore: c.churnRiskScore || 0,
      sentimentTrend: c.sentimentTrend || 'stable',
      lastContactDate: c.lastContactAt,
      openTickets: c.openTickets || 0,
      totalInteractions: c.totalInteractions || 0,
    }));

    const response: CustomerListResponse = {
      customers: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    res.json(response);
  })
);

/**
 * GET /customers/search - Search by name/email/phone
 */
router.get(
  '/search',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { q, limit } = searchQuerySchema.parse(req.query);

    // Build search query with text search or regex
    const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const customers = await Customer.find({
      companyId,
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ],
    })
      .limit(limit)
      .select('name email phone tier')
      .lean();

    const results: CustomerSearchResult[] = customers.map((c) => {
      let matchField: 'name' | 'email' | 'phone' = 'name';
      let matchScore = 0;

      if (c.name && searchRegex.test(c.name)) {
        matchField = 'name';
        matchScore = c.name.toLowerCase().startsWith(q.toLowerCase()) ? 1 : 0.7;
      } else if (c.email && searchRegex.test(c.email)) {
        matchField = 'email';
        matchScore = 0.8;
      } else if (c.phone && searchRegex.test(c.phone)) {
        matchField = 'phone';
        matchScore = 0.8;
      }

      return {
        id: c._id.toString(),
        name: c.name || 'Unknown',
        email: c.email,
        phone: c.phone,
        tier: c.tier || 'standard',
        matchField,
        matchScore,
      };
    });

    // Sort by match score
    results.sort((a, b) => b.matchScore - a.matchScore);

    res.json({ results });
  })
);

/**
 * GET /customers/at-risk - High churn risk customers
 */
router.get(
  '/at-risk',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const customers = await Customer.find({
      companyId,
      churnRiskScore: { $gt: 0.65 },
    })
      .sort({ churnRiskScore: -1 })
      .limit(50)
      .lean();

    const now = Date.now();

    const atRiskCustomers: AtRiskCustomer[] = customers.map((c) => {
      const daysSinceLastContact = c.lastContactAt
        ? Math.floor((now - new Date(c.lastContactAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Determine risk factors
      const riskFactors: string[] = [];
      if (c.sentimentTrend === 'worsening') {
        riskFactors.push('Declining sentiment');
      }
      if ((c.openTickets || 0) >= 2) {
        riskFactors.push(`${c.openTickets} open tickets`);
      }
      if (daysSinceLastContact > 60) {
        riskFactors.push('No recent contact');
      }
      if (c.avgSentiment === 'negative') {
        riskFactors.push('Historically negative sentiment');
      }

      // Recommended actions
      const recommendedActions: string[] = [];
      if (daysSinceLastContact > 30) {
        recommendedActions.push('Schedule proactive outreach call');
      }
      if ((c.openTickets || 0) > 0) {
        recommendedActions.push('Prioritize open ticket resolution');
      }
      if (c.tier === 'enterprise' || c.tier === 'vip') {
        recommendedActions.push('Assign dedicated account manager');
      }
      recommendedActions.push('Offer satisfaction survey or feedback call');

      return {
        id: c._id.toString(),
        name: c.name || 'Unknown',
        email: c.email,
        phone: c.phone,
        tier: c.tier || 'standard',
        lifetimeValue: c.lifetimeValue || 0,
        churnRiskScore: c.churnRiskScore || 0,
        sentimentTrend: c.sentimentTrend || 'stable',
        lastContactDate: c.lastContactAt,
        openTickets: c.openTickets || 0,
        totalInteractions: c.totalInteractions || 0,
        riskFactors,
        recommendedActions,
        daysSinceLastContact,
      };
    });

    res.json({
      atRiskCustomers,
      total: atRiskCustomers.length,
      highestRisk: atRiskCustomers[0]?.churnRiskScore || 0,
    });
  })
);

/**
 * GET /customers/:id - Full customer profile
 */
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;

    const profile = await getCustomerProfile(id as string, companyId);

    if (!profile) {
      throw AppError.notFound('Customer');
    }

    res.json(profile);
  })
);

/**
 * GET /customers/:id/sentiment-timeline - Sentiment history
 */
router.get(
  '/:id/sentiment-timeline',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;

    // Verify customer exists
    const customer = await Customer.findOne({ _id: id, companyId }).lean();
    if (!customer) {
      throw AppError.notFound('Customer');
    }

    const timeline = await buildSentimentTimeline(id as string, companyId);

    res.json(timeline);
  })
);

/**
 * PATCH /customers/:id - Update customer
 */
router.patch(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;
    const updates = updateSchema.parse(req.body);

    const customer = await Customer.findOneAndUpdate(
      { _id: id, companyId },
      { $set: updates },
      { new: true }
    ).lean();

    if (!customer) {
      throw AppError.notFound('Customer');
    }

    // Invalidate cache
    await invalidateCustomerCard(companyId, {
      customerId: id as string,
      phone: customer.phone,
      email: customer.email,
    });

    childLogger.info({ companyId, customerId: id, updates: Object.keys(updates) }, 'Customer updated');

    // Return updated card
    const card = await buildCustomerCard({ customerId: id as string }, companyId);

    res.json({ customer: card });
  })
);

export default router;
