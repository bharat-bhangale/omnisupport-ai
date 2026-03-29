import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Ticket } from '../models/Ticket.js';
import { Customer } from '../models/Customer.js';
import { CallSession } from '../models/CallSession.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { searchKB } from '../services/rag.js';
import { logger } from '../config/logger.js';

const router = Router();
const childLogger = logger.child({ route: 'extension' });

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /extension/ticket-context/:externalId
 * Used by Chrome Extension to fetch context for current Zendesk/Freshdesk ticket
 */
router.get(
  '/ticket-context/:externalId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const { externalId } = req.params;

    // Find ticket by external ID (Zendesk/Freshdesk ticket ID)
    const ticket = await Ticket.findOne({
      companyId,
      $or: [
        { externalId },
        { 'metadata.zendeskId': externalId },
        { 'metadata.freshdeskId': externalId },
      ],
    }).lean();

    if (!ticket) {
      throw AppError.notFound('Ticket');
    }

    // Fetch customer info if available
    let customer = null;
    if (ticket.customerId) {
      customer = await Customer.findById(ticket.customerId)
        .select('name email phone tier tags knownIssues preferredStyle verbosity recentCalls recentTickets')
        .lean();
    }

    // Search KB for relevant recommendations
    let kbRecommendations: Array<{ title: string; content: string; confidence: number; source: string }> = [];
    try {
      const kbResult = await searchKB({
        query: `${ticket.subject} ${ticket.description?.slice(0, 200)}`,
        companyId,
        channel: 'text',
        language: ticket.language || 'en',
        topK: 3,
      });

      if (kbResult.answer) {
        kbRecommendations = kbResult.sources.map((source) => ({
          title: source.title,
          content: source.content,
          confidence: source.score,
          source: source.documentId,
        }));
      }
    } catch (error) {
      childLogger.warn({ error, ticketId: ticket._id }, 'Failed to fetch KB recommendations');
    }

    // Check if customer called recently
    let recentCall = null;
    if (customer?.phone) {
      recentCall = await CallSession.findOne({
        companyId,
        callerPhone: customer.phone,
        status: { $ne: 'active' },
      })
        .select('callId startedAt endedAt summary intent sentiment')
        .sort({ startedAt: -1 })
        .lean();
    }

    res.json({
      ticket: {
        id: ticket._id,
        externalId: ticket.externalId || externalId,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        classification: ticket.classification,
        sentiment: ticket.sentiment,
        language: ticket.language,
        tags: ticket.tags,
        createdAt: ticket.createdAt,
      },
      aiDraft: ticket.aiDraft
        ? {
            content: ticket.aiDraft.content,
            tone: ticket.aiDraft.tone,
            confidence: ticket.aiDraft.confidence,
            sourcesUsed: ticket.aiDraft.sourcesUsed,
            approved: ticket.aiDraft.approved,
            edits: ticket.aiDraft.edits,
          }
        : null,
      customer: customer
        ? {
            id: customer._id,
            name: customer.name,
            email: customer.email,
            tier: customer.tier,
            tags: customer.tags,
            knownIssues: customer.knownIssues,
            preferredStyle: customer.preferredStyle,
            verbosity: customer.verbosity,
          }
        : null,
      kbRecommendations,
      recentCall: recentCall
        ? {
            callId: recentCall.callId,
            startedAt: recentCall.startedAt,
            summary: recentCall.summary,
            intent: recentCall.intent,
            sentiment: recentCall.sentiment?.overall,
            daysAgo: Math.floor(
              (Date.now() - new Date(recentCall.startedAt).getTime()) / (1000 * 60 * 60 * 24)
            ),
          }
        : null,
    });
  })
);

/**
 * GET /extension/kb-search
 * Quick KB search for the extension
 */
router.get(
  '/kb-search',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const query = req.query.q as string;

    if (!query || query.length < 3) {
      throw AppError.badRequest('Query must be at least 3 characters');
    }

    const result = await searchKB({
      query,
      companyId,
      channel: 'text',
      language: (req.query.lang as string) || 'en',
      topK: 5,
    });

    res.json({
      answer: result.answer,
      confidence: result.confidence,
      sources: result.sources.map((s) => ({
        title: s.title,
        content: s.content.slice(0, 300),
        confidence: s.score,
        documentId: s.documentId,
      })),
    });
  })
);

/**
 * GET /extension/customer/:identifier
 * Lookup customer by email or phone for extension context
 */
router.get(
  '/customer/:identifier',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId } = req.user;
    const { identifier } = req.params;

    const customer = await Customer.findOne({
      companyId,
      $or: [{ email: identifier }, { phone: identifier }],
    })
      .select('name email phone tier tags knownIssues preferredStyle verbosity')
      .lean();

    if (!customer) {
      throw AppError.notFound('Customer');
    }

    // Get recent interactions
    const [recentCalls, recentTickets] = await Promise.all([
      CallSession.find({
        companyId,
        customerId: customer._id,
      })
        .select('callId startedAt summary intent sentiment')
        .sort({ startedAt: -1 })
        .limit(5)
        .lean(),
      Ticket.find({
        companyId,
        customerId: customer._id,
      })
        .select('subject status priority classification createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    res.json({
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        tier: customer.tier,
        tags: customer.tags,
        knownIssues: customer.knownIssues,
        preferredStyle: customer.preferredStyle,
        verbosity: customer.verbosity,
      },
      history: {
        calls: recentCalls.map((call) => ({
          callId: call.callId,
          date: call.startedAt,
          summary: call.summary?.slice(0, 100),
          intent: call.intent,
          sentiment: call.sentiment?.overall,
        })),
        tickets: recentTickets.map((ticket) => ({
          id: ticket._id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.classification?.intent,
          date: ticket.createdAt,
        })),
      },
    });
  })
);

/**
 * POST /extension/copy-draft
 * Track when agent copies AI draft (for analytics)
 */
router.post(
  '/copy-draft',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyId, userId } = req.user;
    const { ticketId, edited } = req.body;

    childLogger.info(
      { companyId, userId, ticketId, edited },
      'Agent copied AI draft from extension'
    );

    // Could track this in analytics/feedback

    res.json({ success: true });
  })
);

export default router;
