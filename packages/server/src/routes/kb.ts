import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import mongoose from 'mongoose';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../middleware/AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { KBDocument, KBGap } from '../models/KBDocument.js';
import { kbIndexQueue } from '../queues/index.js';
import { searchKB, deleteDocumentVectors } from '../services/rag.js';

const router = Router();
const childLogger = logger.child({ route: 'kb' });

// Initialize S3 client
const s3Client = new S3Client({
  region: env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure multer for PDF uploads (10MB max)
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Request with user context
interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

// Validation schemas
const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  language: z.string().length(2).default('en'),
});

const createURLDocumentSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(500),
  category: z.string().min(1).max(100).optional().default('General'),
  language: z.string().length(2).optional().default('en'),
});

const createTextDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(10).max(100000),
  category: z.string().min(1).max(100).optional().default('General'),
  language: z.string().length(2).optional().default('en'),
});

const searchQuerySchema = z.object({
  query: z.string().min(1).max(2000),
  language: z.string().length(2).optional(),
});

const resolveGapSchema = z.object({
  answer: z.string().min(1).max(10000),
  addToKB: z.boolean().default(false),
  title: z.string().min(1).max(500).optional(),
  category: z.string().min(1).max(100).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'indexed', 'failed']).optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * POST /kb/documents - Upload PDF document
 */
router.post(
  '/documents',
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;

    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    if (!req.file) {
      throw AppError.badRequest('No file uploaded');
    }

    const { title, category, language } = createDocumentSchema.parse(req.body);

    // Generate S3 key
    const s3Key = `kb/${companyId}/${Date.now()}-${req.file.originalname}`;

    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: 'application/pdf',
      })
    );

    // Create document record
    const document = await KBDocument.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      title,
      category,
      language,
      sourceType: 'pdf',
      s3Key,
      status: 'pending',
      createdBy: userId,
    });

    // Queue for indexing
    await kbIndexQueue.add(
      `index-${document._id}`,
      {
        documentId: document._id.toString(),
        companyId,
      },
      { priority: 1 }
    );

    childLogger.info(
      { documentId: document._id, title, companyId },
      'PDF document uploaded and queued for indexing'
    );

    res.status(201).json({
      success: true,
      document: {
        id: document._id,
        title: document.title,
        category: document.category,
        status: document.status,
      },
    });
  })
);

/**
 * POST /kb/url - Create document from URL
 */
router.post(
  '/url',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;

    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const { url, title, category, language } = createURLDocumentSchema.parse(req.body);

    // Create document record
    const document = await KBDocument.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      title,
      category,
      language,
      sourceType: 'url',
      sourceUrl: url,
      status: 'pending',
      createdBy: userId,
    });

    // Queue for indexing
    await kbIndexQueue.add(
      `index-${document._id}`,
      {
        documentId: document._id.toString(),
        companyId,
      },
      { priority: 2 }
    );

    childLogger.info(
      { documentId: document._id, url, companyId },
      'URL document queued for indexing'
    );

    res.status(201).json({
      success: true,
      document: {
        id: document._id,
        title: document.title,
        category: document.category,
        sourceUrl: document.sourceUrl,
        status: document.status,
      },
    });
  })
);

/**
 * POST /kb/text - Create document from raw text
 */
router.post(
  '/text',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;

    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const { title, content, category, language } = createTextDocumentSchema.parse(req.body);

    // Create document record
    const document = await KBDocument.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      title,
      category,
      language,
      sourceType: 'text',
      rawText: content,
      status: 'pending',
      createdBy: userId,
    });

    // Queue for indexing
    await kbIndexQueue.add(
      `index-${document._id}`,
      {
        documentId: document._id.toString(),
        companyId,
      },
      { priority: 2 }
    );

    childLogger.info(
      { documentId: document._id, title, companyId },
      'Text document queued for indexing'
    );

    res.status(201).json({
      success: true,
      document: {
        id: document._id,
        title: document.title,
        category: document.category,
        status: document.status,
      },
    });
  })
);

/**
 * GET /kb/documents - List documents
 */
router.get(
  '/documents',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { status, category, page, limit } = listQuerySchema.parse(req.query);

    const filter: Record<string, unknown> = { companyId: new mongoose.Types.ObjectId(companyId) };
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [documents, total] = await Promise.all([
      KBDocument.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-rawText')
        .lean(),
      KBDocument.countDocuments(filter),
    ]);

    res.json({
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /kb/documents/:id - Get single document
 */
router.get(
  '/documents/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const document = await KBDocument.findOne({
      _id: req.params.id,
      companyId: new mongoose.Types.ObjectId(companyId),
    }).lean();

    if (!document) {
      throw AppError.notFound('Document');
    }

    res.json({ document });
  })
);

/**
 * DELETE /kb/documents/:id - Delete document
 */
router.delete(
  '/documents/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const document = await KBDocument.findOne({
      _id: req.params.id,
      companyId: new mongoose.Types.ObjectId(companyId),
    });

    if (!document) {
      throw AppError.notFound('Document');
    }

    // Delete from S3 if applicable
    if (document.s3Key) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.AWS_S3_BUCKET,
            Key: document.s3Key,
          })
        );
      } catch (error) {
        childLogger.warn({ error, s3Key: document.s3Key }, 'Failed to delete S3 object');
      }
    }

    // Delete vectors from Pinecone
    try {
      await deleteDocumentVectors(companyId, document._id.toString(), document.language);
    } catch (error) {
      childLogger.warn({ error, documentId: document._id }, 'Failed to delete Pinecone vectors');
    }

    // Delete document from MongoDB
    await document.deleteOne();

    childLogger.info(
      { documentId: document._id, companyId },
      'KB document deleted'
    );

    res.json({ success: true, message: 'Document deleted' });
  })
);

/**
 * POST /kb/search - Test KB search (admin endpoint)
 */
router.post(
  '/search',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const { query, language } = searchQuerySchema.parse(req.body);

    const result = await searchKB({
      query,
      companyId,
      language,
      channel: 'text',
      topK: 5,
    });

    res.json({
      result,
      meta: {
        query,
        language: language || 'en',
      },
    });
  })
);

/**
 * GET /kb/gaps - List KB gaps
 */
router.get(
  '/gaps',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const gaps = await KBGap.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      status: { $ne: 'resolved' },
    })
      .sort({ frequency: -1 })
      .limit(10)
      .lean();

    res.json({ gaps });
  })
);

/**
 * POST /kb/gaps/:id/resolve - Resolve a KB gap
 */
router.post(
  '/gaps/:id/resolve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.sub;

    if (!companyId || !userId) {
      throw AppError.unauthorized('Missing user context');
    }

    const { answer, addToKB, title, category } = resolveGapSchema.parse(req.body);

    const gap = await KBGap.findOne({
      _id: req.params.id,
      companyId: new mongoose.Types.ObjectId(companyId),
    });

    if (!gap) {
      throw AppError.notFound('KB Gap');
    }

    let documentId: mongoose.Types.ObjectId | undefined;

    // Create KB document if requested
    if (addToKB) {
      if (!title) {
        throw AppError.badRequest('Title is required when adding to KB');
      }

      const document = await KBDocument.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        title,
        category: category || 'FAQ',
        language: 'en',
        sourceType: 'manual',
        rawText: `Q: ${gap.query}\n\nA: ${answer}`,
        status: 'pending',
        createdBy: userId,
      });

      documentId = document._id as mongoose.Types.ObjectId;

      // Queue for indexing
      await kbIndexQueue.add(
        `index-${document._id}`,
        {
          documentId: document._id.toString(),
          companyId,
        },
        { priority: 1 }
      );
    }

    // Update gap as resolved
    gap.status = 'resolved';
    gap.resolution = {
      answer,
      documentId,
      resolvedBy: userId,
      resolvedAt: new Date(),
    };
    await gap.save();

    childLogger.info(
      { gapId: gap._id, addToKB, documentId },
      'KB gap resolved'
    );

    res.json({
      success: true,
      gap: {
        id: gap._id,
        status: gap.status,
        documentId,
      },
    });
  })
);

/**
 * GET /kb/stats - Get KB statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw AppError.unauthorized('Missing company context');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [documentStats, gapStats, categoryStats] = await Promise.all([
      // Document counts by status
      KBDocument.aggregate([
        { $match: { companyId: companyObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Gap counts
      KBGap.aggregate([
        { $match: { companyId: companyObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Documents by category
      KBDocument.aggregate([
        { $match: { companyId: companyObjectId, status: 'indexed' } },
        { $group: { _id: '$category', count: { $sum: 1 }, chunks: { $sum: '$chunkCount' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const documents = {
      pending: 0,
      processing: 0,
      indexed: 0,
      failed: 0,
      total: 0,
    };

    for (const stat of documentStats) {
      documents[stat._id as keyof typeof documents] = stat.count;
      documents.total += stat.count;
    }

    const gaps = {
      open: 0,
      inProgress: 0,
      resolved: 0,
    };

    for (const stat of gapStats) {
      if (stat._id === 'open') gaps.open = stat.count;
      else if (stat._id === 'in_progress') gaps.inProgress = stat.count;
      else if (stat._id === 'resolved') gaps.resolved = stat.count;
    }

    res.json({
      documents,
      gaps,
      categories: categoryStats.map((c) => ({
        name: c._id,
        documents: c.count,
        chunks: c.chunks,
      })),
    });
  })
);

export default router;
