import type { NextFunction, Request, Response } from 'express';
import type { AdminAccessLevel } from '../../../generated/prisma/client.js';
import { hasMinAdminAccessLevel } from '../../../config/kyc.js';
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
        adminProfileId?: string | null;
        adminAccessLevel?: AdminAccessLevel | null;
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
    // NOTE: le code original utilisait void promise.then().then().catch() ce qui
    // n'est PAS un pattern middleware Express fiable. Les callbacks .then()/.catch()
    // appellent next() via des closures JS, pas via le flux middleware d'Express.
    // Si findByPhone ou findAdminProfileByUserId lèvent une erreur non catchée
    // (ex: Prisma connection lost), next() n'est jamais appelé et la requête pend.
    // La solution async/await garantit que next(error) est toujours appelé en cas
    // d'échec, et que next() est appelé exactement une fois dans tous les chemins.
    void (async () => {
      const user = await authRepository.findById(payload.userId);
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
        adminProfileId: null,
        adminAccessLevel: null,
      };

      if (user.role === 'ADMIN') {
        try {
          const adminProfile = await authRepository.findAdminProfileByUserId(user.id);
          if (adminProfile) {
            req.user = {
              ...req.user!,
              adminProfileId: adminProfile.id,
              adminAccessLevel: adminProfile.niveauAcces,
            };
          }
        } catch (error) {
          // Si la lecture du profil admin échoue, on continue quand même :
          // l'utilisateur est authentifié, il aura juste les champs admin à null.
          // Ceci évite de bloquer tous les endpoints admin si le profil est corrompu.
          // eslint-disable-next-line no-console
          console.error('Failed to load admin profile for user', user.id, error);
        }
      }

      next();
    })().catch((error) => {
      next(error instanceof Error ? error : new UnauthorizedError('Authentication failed'));
    });
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

export function requireAdminLevel(minimumLevel: AdminAccessLevel) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (req.user.role !== 'ADMIN') {
      next(new ForbiddenError('Admin access required'));
      return;
    }

    if (!hasMinAdminAccessLevel(req.user.adminAccessLevel, minimumLevel)) {
      next(new ForbiddenError('Insufficient admin access level'));
      return;
    }

    next();
  };
}
