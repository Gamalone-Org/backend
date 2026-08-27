import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { kycConfig, computeRetentionUntil, hasMinAdminAccessLevel } from '../../src/config/kyc.js';

describe('kycConfig validation', () => {
  it('exports retentionDays as a positive integer', () => {
    expect(Number.isInteger(kycConfig.retentionDays)).toBe(true);
    expect(kycConfig.retentionDays).toBeGreaterThan(0);
  });

  it('exports signedUrlTtlSeconds as a positive integer', () => {
    expect(Number.isInteger(kycConfig.signedUrlTtlSeconds)).toBe(true);
    expect(kycConfig.signedUrlTtlSeconds).toBeGreaterThan(0);
  });

  it('signedUrlTtlSeconds is within allowed range (60-3600)', () => {
    expect(kycConfig.signedUrlTtlSeconds).toBeGreaterThanOrEqual(60);
    expect(kycConfig.signedUrlTtlSeconds).toBeLessThanOrEqual(3600);
  });

  it('retentionDays is within allowed range (30-3650)', () => {
    expect(kycConfig.retentionDays).toBeGreaterThanOrEqual(30);
    expect(kycConfig.retentionDays).toBeLessThanOrEqual(3650);
  });
});

describe('computeRetentionUntil', () => {
  it('computes retention date from base date plus retention days', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const result = computeRetentionUntil(base);
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(base.getTime());
  });

  it('uses current date when no base date is provided', () => {
    const before = new Date();
    const result = computeRetentionUntil();
    const after = new Date();
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime() + kycConfig.retentionDays * 86400000 - 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime() + kycConfig.retentionDays * 86400000 + 1000);
  });

  it('adds retention days from the base date', () => {
    const base = new Date('2026-06-15T14:30:00Z');
    const result = computeRetentionUntil(base);
    const expectedMs = base.getTime() + kycConfig.retentionDays * 86400000;
    expect(result.getTime()).toBe(expectedMs);
  });
});

describe('hasMinAdminAccessLevel', () => {
  it('returns true when current level meets minimum', () => {
    expect(hasMinAdminAccessLevel('MODERATEUR', 'SUPPORT')).toBe(true);
    expect(hasMinAdminAccessLevel('SUPER_ADMIN', 'MODERATEUR')).toBe(true);
    expect(hasMinAdminAccessLevel('SUPPORT', 'SUPPORT')).toBe(true);
  });

  it('returns false when current level is below minimum', () => {
    expect(hasMinAdminAccessLevel('SUPPORT', 'MODERATEUR')).toBe(false);
    expect(hasMinAdminAccessLevel('SUPPORT', 'SUPER_ADMIN')).toBe(false);
    expect(hasMinAdminAccessLevel('MODERATEUR', 'SUPER_ADMIN')).toBe(false);
  });

  it('returns false for null or undefined current level', () => {
    expect(hasMinAdminAccessLevel(null, 'SUPPORT')).toBe(false);
    expect(hasMinAdminAccessLevel(undefined, 'SUPPORT')).toBe(false);
  });
});
