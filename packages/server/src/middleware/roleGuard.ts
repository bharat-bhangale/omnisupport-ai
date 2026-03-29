import { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError.js';

interface AuthRequest extends Request {
  user?: {
    sub: string;
    companyId: string;
    role: string;
  };
}

/**
 * Middleware to check if user has required role(s)
 * Usage: roleGuard('admin') or roleGuard('manager', 'admin')
 */
export function roleGuard(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;

    if (!userRole) {
      throw AppError.unauthorized('User role not found');
    }

    if (!allowedRoles.includes(userRole)) {
      throw AppError.forbidden(
        `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${userRole}`
      );
    }

    next();
  };
}
