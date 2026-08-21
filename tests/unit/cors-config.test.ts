import { describe, expect, it } from 'vitest';
import { getCorsAllowlist, isAllowedOrigin } from '../../src/config/cors.js';

describe('CORS configuration', () => {
  it('allows a whitelisted development origin including the local API origin', () => {
    const allowlist = getCorsAllowlist({
      NODE_ENV: 'development',
      API_PUBLIC_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    });

    expect(allowlist).toContain('http://localhost:5000');
    expect(isAllowedOrigin('http://localhost:5000', {
      NODE_ENV: 'development',
      API_PUBLIC_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    })).toBe(true);
  });

  it('rejects a non-whitelisted origin', () => {
    expect(isAllowedOrigin('https://evil.example', {
      NODE_ENV: 'development',
      API_PUBLIC_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    })).toBe(false);
  });

  it('keeps the allowlist strict and never uses wildcard', () => {
    const allowlist = getCorsAllowlist({
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'https://api.gamalone.com',
      CORS_ORIGINS: 'https://app.gamalone.com,https://admin.gamalone.com',
    });

    expect(allowlist).not.toContain('*');
    expect(allowlist).toEqual([
      'https://admin.gamalone.com',
      'https://api.gamalone.com',
      'https://app.gamalone.com',
    ]);
  });

  it('includes the API_PUBLIC_URL in production', () => {
    const allowlist = getCorsAllowlist({
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'https://api.gamalone.com',
      CORS_ORIGINS: 'https://app.gamalone.com',
    });

    expect(allowlist).toContain('https://api.gamalone.com');
    expect(allowlist).toContain('https://app.gamalone.com');
  });

  it('treats a missing Origin as allowed for same-origin or non-browser callers', () => {
    expect(isAllowedOrigin(undefined, {
      NODE_ENV: 'development',
      API_PUBLIC_URL: 'http://localhost:5000',
      CORS_ORIGINS: 'http://localhost:3000',
    })).toBe(true);
  });
});
