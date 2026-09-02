import { describe, expect, it } from 'vitest';
import { registerSchema } from '../../src/modules/auth/schema.js';

const artisanBase = {
  role: 'ARTISAN' as const,
  nom: 'Atelier Kokou',
  telephone: '+22890123456',
  motDePasse: 'S3cretPassword!',
  specialite: 'Sculpture',
  localisation: 'Lomé, Togo',
};

describe('registerSchema artisan type', () => {
  it('defaults an ARTISAN to ARTISAN type when none is provided', () => {
    const parsed = registerSchema.parse(artisanBase);
    expect(parsed.type).toBe('ARTISAN');
  });

  it('accepts an explicit ARTISAN type', () => {
    const parsed = registerSchema.parse({ ...artisanBase, type: 'ARTISAN' });
    expect(parsed.type).toBe('ARTISAN');
  });

  it('accepts an explicit ARTISTE type', () => {
    const parsed = registerSchema.parse({ ...artisanBase, type: 'ARTISTE' });
    expect(parsed.type).toBe('ARTISTE');
  });

  it('rejects an invalid artisan type value', () => {
    expect(() => registerSchema.parse({ ...artisanBase, type: 'INVALID' })).toThrow();
    expect(() => registerSchema.parse({ ...artisanBase, type: 123 })).toThrow();
  });

  it('rejects a non-object type value', () => {
    expect(() => registerSchema.parse({ ...artisanBase, type: null })).toThrow();
  });
});
