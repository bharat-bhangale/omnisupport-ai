// Authentication
export { authMiddleware, optionalAuthMiddleware, isAuthenticated, getUser, getCompanyId } from './auth.js';
export type { AuthRequest, AuthUser } from './auth.js';

// Authorization
export { roleGuard } from './roleGuard.js';

// Multi-tenant scoping
export {
  redisKey,
  redisKeyForCompany,
  pineconeNs,
  pineconeNsForCompany,
  scopedFind,
  scopedFindOne,
  scopedFindById,
  scopedCount,
  scopedAggregate,
  validateOwnership,
  getCurrentUser,
  getCompanyIdFromReq,
} from './companyScope.js';

// Error handling
export { AppError } from './AppError.js';
export { errorHandler, notFoundHandler, asyncHandler } from './errorHandler.js';
