import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/common/errors/AppError.js';
import { JwtService } from '../../src/modules/auth/services/JwtService.js';

describe('JwtService', () => {
  const jwtService = new JwtService('1234567890123456789012345678901234567890');

  it('generates a valid token with a minimal payload', () => {
    const token = jwtService.generateToken({
      id: '11111111-1111-1111-1111-111111111111',
      role: 'ACHETEUR',
    });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies a valid token and returns the user payload', () => {
    const token = jwtService.generateToken({
      id: '22222222-2222-2222-2222-222222222222',
      role: 'ADMIN',
    });

    const payload = jwtService.verifyToken(token);

    expect(payload.userId).toBe('22222222-2222-2222-2222-222222222222');
    expect(payload.role).toBe('ADMIN');
  });

  it('rejects an invalid token', () => {
    expect(() => jwtService.verifyToken('not-a-valid-token')).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const expiredJwtService = new JwtService('1234567890123456789012345678901234567890', '1ms');
    const token = expiredJwtService.generateToken({
      id: '33333333-3333-3333-3333-333333333333',
      role: 'ARTISAN',
    });

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => expiredJwtService.verifyToken(token)).toThrow(UnauthorizedError);
        resolve();
      }, 20);
    });
  });
});
