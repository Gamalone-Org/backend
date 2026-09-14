import type { NextFunction, Request, Response } from 'express';
import type { AdminAccessLevel, AdminPermission } from '../../../generated/prisma/client.js';
import { hasMinAdminAccessLevel } from '../../../config/kyc.js';
import { isPrivilegedPermission } from '../../../config/admin-permissions.js';
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

/**
 * Vérifie que l'utilisateur authentifié est un administrateur disposant de
 * TOUTES les permissions demandées (sémantique ET, plusieurs permissions dans
 * une même route = le cumul est requis).
 *
 * Règles de défense en profondeur :
 * - le SUPER_ADMIN possède par nature toutes les permissions (OPTION A, aucun
 *   enregistrement nécessaire dans admin_profile_permissions) ;
 * - les permissions privilégiées ADMINS_* ne peuvent être exercées QUE par un
 *   SUPER_ADMIN : un ADMIN simple ne peut pas les obtenir, même si une
 *   attribution erronée existerait en base ;
 * - un profil AdminProfil manquant ou inactif refuse l'accès.
 */
export function requirePermission(...permissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (req.user.role !== 'ADMIN') {
      next(new ForbiddenError('Admin access required'));
      return;
    }

    if (!req.user.adminProfileId || !req.user.adminAccessLevel) {
      next(new ForbiddenError('Admin profile required'));
      return;
    }

    if (permissions.length === 0) {
      next(new ForbiddenError('At least one permission is required'));
      return;
    }

    // Le SUPER_ADMIN possède toutes les permissions par nature.
    if (req.user.adminAccessLevel === 'SUPER_ADMIN') {
      next();
      return;
    }

    // Règle anti-escalade : les permissions ADMINS_* sont strictement réservées
    // au SUPER_ADMIN. La vérification se fait AVANT la requête en base pour
    // garantir qu'aucun ADMIN simple ne puisse les exercer.
    if (permissions.some((permission) => isPrivilegedPermission(permission))) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    void (async () => {
      try {
        const stored = await authRepository.findAdminPermissionsByProfileId(
          req.user!.adminProfileId!
        );
        const owned = new Set<string>(stored.map((p) => p.permission));
        const allowed = permissions.every((permission) => owned.has(permission));
        if (!allowed) {
          next(new ForbiddenError('Insufficient permissions'));
          return;
        }
        next();
      } catch (error) {
        next(error instanceof Error ? error : new ForbiddenError('Insufficient permissions'));
      }
    })();
  };
}
