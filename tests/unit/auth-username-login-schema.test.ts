import { describe, expect, it } from 'vitest';
import {
  isValidUsername,
  normalizeUsername,
  resolveLoginIdentifier,
  loginIdentifierSchema,
} from '../../src/modules/auth/username';

describe('normalizeUsername', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeUsername('  G.Apedo ')).toBe('g.apedo');
    expect(normalizeUsername('  AWA  ')).toBe('awa');
  });
});

describe('isValidUsername', () => {
  it('accepts the SUPER_ADMIN username g.apedo', () => {
    expect(isValidUsername('g.apedo')).toBe(true);
  });

  it.each([
    'awa.mensah',
    'awa_mensah',
    'awa-mensah',
    'g8.apedo',
    'a.b_c-d.e',
    'awa..mensah',
    'abc',
  ])('accepts %s', (username) => {
    expect(isValidUsername(username)).toBe(true);
  });

  it.each([
    'Awa.Mensah', // majuscules
    '.awa', // commence par un séparateur
    'awa.', // finit par un séparateur
    'awa mensah', // espace
    'awa!', // caractère interdit
    'awa@dan', // '@' interdit
    'ab', // trop court
    'x'.repeat(31), // trop long
    '',
  ])('rejects %s', (username) => {
    expect(isValidUsername(username)).toBe(false);
  });
});

describe('resolveLoginIdentifier', () => {
  it('detects an email by its "@" and lowercases it', () => {
    expect(resolveLoginIdentifier({ identifier: '  AWA@Exemple.com ' })).toEqual({
      type: 'email',
      value: 'awa@exemple.com',
    });
  });

  it('detects a phone-like value (international or local digits)', () => {
    expect(resolveLoginIdentifier({ identifier: '+22890123456' })).toEqual({
      type: 'phone',
      value: '+22890123456',
    });
    expect(resolveLoginIdentifier({ identifier: '+228 90 12 34 56' })).toEqual({
      type: 'phone',
      value: '+228 90 12 34 56',
    });
    expect(resolveLoginIdentifier({ identifier: '22890123456' })).toEqual({
      type: 'phone',
      value: '22890123456',
    });
  });

  it('falls back to username for any other content and normalizes it', () => {
    expect(resolveLoginIdentifier({ identifier: 'G.Apedo ' })).toEqual({
      type: 'username',
      value: 'g.apedo',
    });
  });

  it('supports the legacy telephone field (backward compatibility)', () => {
    expect(resolveLoginIdentifier({ telephone: '+22890123456' })).toEqual({
      type: 'phone',
      value: '+22890123456',
    });
  });

  it('gives identifier precedence over telephone', () => {
    expect(
      resolveLoginIdentifier({ telephone: '+22890123456', identifier: 'g.apedo' })
    ).toEqual({ type: 'username', value: 'g.apedo' });
  });
});

describe('loginIdentifierSchema', () => {
  it('accepts identifier + motDePasse', () => {
    const parsed = loginIdentifierSchema.parse({ identifier: 'g.apedo', motDePasse: 'S3cret!' });
    expect(parsed).toMatchObject({ identifier: 'g.apedo' });
  });

  it('accepts the legacy telephone field', () => {
    const parsed = loginIdentifierSchema.parse({
      telephone: '+22890123456',
      motDePasse: 'S3cret!',
    });
    expect(parsed.telephone).toBe('+22890123456');
  });

  it('accepts role ADMIN', () => {
    const parsed = loginIdentifierSchema.parse({
      identifier: 'g.apedo',
      motDePasse: 'S3cret!',
      role: 'ADMIN',
    });
    expect(parsed.role).toBe('ADMIN');
  });

  it.each(['ACHETEUR', 'ARTISAN'])('accepts role %s for backward compatibility', (role) => {
    const parsed = loginIdentifierSchema.parse({
      telephone: '+22890123456',
      motDePasse: 'S3cret!',
      role,
    });
    expect(parsed.role).toBe(role);
  });

  it('rejects when neither identifier nor telephone is provided', () => {
    expect(() =>
      loginIdentifierSchema.parse({ motDePasse: 'S3cret!' })
    ).toThrowError(/Either telephone or identifier is required/);
  });

  it('rejects an unknown role', () => {
    expect(() =>
      loginIdentifierSchema.parse({ identifier: 'g.apedo', motDePasse: 'S3cret!', role: 'ROOT' })
    ).toThrow();
  });

  it('rejects unknown/extra fields (strict)', () => {
    expect(() =>
      loginIdentifierSchema.parse({
        identifier: 'g.apedo',
        motDePasse: 'S3cret!',
        otp: '123456',
      })
    ).toThrow();
  });
});