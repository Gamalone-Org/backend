import type { NextFunction, Request, Response } from 'express';
import { JwtService } from '../services/JwtService.js';
import { AuthRepository } from '../repositories/AuthRepository.js';
import { prisma } from '../../../config/database.js';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/AppError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        telephone: string;
        statut: string;
      };
    }
  }
}

const jwtService = new JwtService();
const authRepository = new AuthRepository(prisma);

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization) {
    next(new UnauthorizedError('Missing or invalid bearer token'));
    return;
  }

  const parts = authorization.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    next(new UnauthorizedError('Missing or invalid bearer token'));
    return;
  }

  const token = parts[1].trim();

  try {
    const payload = jwtService.verifyToken(token);
    void authRepository.findById(payload.userId).then((user) => {
      if (!user) {
        next(new UnauthorizedError('User not found'));
        return;
      }

      if (user.statut === 'SUSPENDU' || user.statut === 'INACTIF') {
        next(new ForbiddenError('Account is not active'));
        return;
      }

      req.user = {
        id: user.id,
        role: user.role,
        telephone: user.telephone,
        statut: user.statut,
      };
      next();
    }).catch((error) => next(error));
  } catch (error) {
    next(error instanceof Error ? error : new UnauthorizedError('Invalid token'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
