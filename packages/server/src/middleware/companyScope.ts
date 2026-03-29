import { Request } from 'express';
import type { Model, Document, FilterQuery } from 'mongoose';
import { AppError } from './AppError.js';
import type { AuthRequest, AuthUser } from './auth.js';

/**
 * Get company-scoped Redis key
 * @param req - Authenticated request
 * @param suffix - Key suffix (e.g., 'session:123', 'analytics:30d')
 * @returns Namespaced Redis key
 */
export function redisKey(req: Request, suffix: string): string {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for Redis key');
  }
  return `${user.companyId}:${suffix}`;
}

/**
 * Get company-scoped Redis key using companyId directly
 */
export function redisKeyForCompany(companyId: string, suffix: string): string {
  return `${companyId}:${suffix}`;
}

/**
 * Get company-scoped Pinecone namespace
 * @param req - Authenticated request
 * @param lang - Language code (default: 'en')
 * @returns Pinecone namespace
 */
export function pineconeNs(req: Request, lang: string = 'en'): string {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for Pinecone namespace');
  }
  return `${user.companyId}:${lang}`;
}

/**
 * Get Pinecone namespace using companyId directly
 */
export function pineconeNsForCompany(companyId: string, lang: string = 'en'): string {
  return `${companyId}:${lang}`;
}

/**
 * Create a company-scoped query helper
 * Automatically adds companyId filter to all queries
 */
export function scopedFind<T extends Document>(
  model: Model<T>,
  req: Request,
  additionalQuery: FilterQuery<T> = {}
) {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for scoped query');
  }

  const scopedQuery = {
    ...additionalQuery,
    companyId: user.companyId,
  } as FilterQuery<T>;

  return model.find(scopedQuery);
}

/**
 * Create a company-scoped findOne helper
 */
export function scopedFindOne<T extends Document>(
  model: Model<T>,
  req: Request,
  additionalQuery: FilterQuery<T> = {}
) {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for scoped query');
  }

  const scopedQuery = {
    ...additionalQuery,
    companyId: user.companyId,
  } as FilterQuery<T>;

  return model.findOne(scopedQuery);
}

/**
 * Create a company-scoped findById helper
 * Also validates that the document belongs to the company
 */
export async function scopedFindById<T extends Document & { companyId?: unknown }>(
  model: Model<T>,
  req: Request,
  id: string
): Promise<T | null> {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for scoped query');
  }

  const doc = await model.findById(id);
  
  if (!doc) {
    return null;
  }

  // Verify document belongs to this company
  const docCompanyId = doc.companyId?.toString();
  if (docCompanyId !== user.companyId) {
    // Return null to prevent data leakage (don't reveal document exists)
    return null;
  }

  return doc;
}

/**
 * Create a company-scoped countDocuments helper
 */
export function scopedCount<T extends Document>(
  model: Model<T>,
  req: Request,
  additionalQuery: FilterQuery<T> = {}
): Promise<number> {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for scoped query');
  }

  const scopedQuery = {
    ...additionalQuery,
    companyId: user.companyId,
  } as FilterQuery<T>;

  return model.countDocuments(scopedQuery);
}

/**
 * Create a company-scoped aggregate helper
 * Prepends $match stage with companyId filter
 */
export function scopedAggregate<T extends Document>(
  model: Model<T>,
  req: Request,
  pipeline: object[] = []
) {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context for scoped aggregation');
  }

  // Prepend company scope match
  const scopedPipeline = [
    { $match: { companyId: user.companyId } },
    ...pipeline,
  ];

  return model.aggregate(scopedPipeline);
}

/**
 * Validate that a document belongs to the user's company
 * @throws AppError.notFound if document doesn't exist or belongs to different company
 */
export function validateOwnership<T extends { companyId?: unknown }>(
  doc: T | null,
  req: Request,
  resourceName: string = 'Resource'
): asserts doc is T {
  if (!doc) {
    throw AppError.notFound(resourceName);
  }

  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context');
  }

  const docCompanyId = doc.companyId?.toString();
  if (docCompanyId !== user.companyId) {
    // Return 404 to prevent data leakage
    throw AppError.notFound(resourceName);
  }
}

/**
 * Get the current user from request
 */
export function getCurrentUser(req: Request): AuthUser {
  const user = (req as AuthRequest).user;
  if (!user) {
    throw AppError.unauthorized('Not authenticated');
  }
  return user;
}

/**
 * Get company ID from request
 */
export function getCompanyIdFromReq(req: Request): string {
  const user = (req as AuthRequest).user;
  if (!user?.companyId) {
    throw AppError.unauthorized('Missing company context');
  }
  return user.companyId;
}
