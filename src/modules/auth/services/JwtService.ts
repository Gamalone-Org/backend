import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { UnauthorizedError } from '../../../common/errors/AppError.js';
import type { UserRole } from '../../../generated/prisma/client.js';

export type JwtUserPayload = {
  userId: string;
  role: UserRole;
};

export class JwtService {
  constructor(
    private readonly secret: string = env.JWT_SECRET,
    private readonly expiresIn: string = env.JWT_EXPIRES_IN
  ) {
    if (!this.secret || this.secret.length < 32) {
      throw new UnauthorizedError('JWT secret is not configured');
    }
  }

  generateToken(user: { id: string; role: UserRole }): string {
    return jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      this.secret as string,
      {
        expiresIn: this.expiresIn as any,
      }
    );
  }

  verifyToken(token: string): JwtUserPayload {
    try {
      const payload = jwt.verify(token, this.secret) as JwtPayload;

      if (!payload || typeof payload === 'string' || !payload.userId || !payload.role) {
        throw new UnauthorizedError('Invalid token payload');
      }

      const role = payload.role;
      if (typeof role !== 'string' || !['ACHETEUR', 'ARTISAN', 'ADMIN'].includes(role)) {
        throw new UnauthorizedError('Invalid token payload');
      }

      return {
        userId: String(payload.userId),
        role: role as UserRole,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      const message = error instanceof Error && 'name' in error ? error.name : 'UNKNOWN_ERROR';
      if (message === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }

      throw new UnauthorizedError('Invalid token');
    }
  }
}
