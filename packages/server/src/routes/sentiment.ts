import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Customer } from '../models/Customer.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { getChurnRiskScore, getTopAtRiskCustomers } from '../services/sentiment.js';

const router = Router();
const childLogger = logger.child({ route: 'sentiment' });

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Helper to check manager+ role
function requireManager(req: AuthRequest): void {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'manager' && role !== 'supervisor') {
    throw AppError.forbidden('Manager access required');
  }
}

/**
 * GET /customers/:id/churn-risk - Get churn risk for a customer
 */
router.get(
  '/customers/:id/churn-risk',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { id } = req.params;

    // Verify customer belongs to company
    const customer = await Customer.findOne({
      _id: new mongoose.Types.ObjectId(id),
      companyId: new mongoose.Types.ObjectId(companyId),
    }).lean();

    if (!customer) {
      throw AppError.notFound('Customer');
    }

    const result = await getChurnRiskScore(id, companyId);

    res.json({
      success: true,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        tier: customer.tier,
      },
      churnRisk: {
        score: result.score,
        level: result.score < 0.4 ? 'low' : result.score < 0.65 ? 'medium' : 'high',
        timeline: result.timeline,
        channelBreakdown: result.channelBreakdown,
        contactFrequency: result.contactFrequency,
      },
    });
  })
);

/**
 * GET /analytics/churn-risk - Get top at-risk customers
 */
router.get(
  '/analytics/churn-risk',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    requireManager(req);

    const companyId = req.user!.companyId;

    childLogger.info({ companyId }, 'Fetching at-risk customers');

    const customers = await getTopAtRiskCustomers(companyId, 10);

    res.json({
      success: true,
      customers: customers.map((c) => ({
        id: c.customerId,
        name: c.name,
        email: c.email,
        tier: c.tier,
        churnRiskScore: c.churnRiskScore,
        riskLevel: c.churnRiskScore < 0.4 ? 'low' : c.churnRiskScore < 0.65 ? 'medium' : 'high',
      })),
      total: customers.length,
    });
  })
);

export default router;
