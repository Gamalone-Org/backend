import { describe, expect, it } from 'vitest';
import {
  createOeuvreSchema,
  updateOeuvreSchema,
  reorderMediasSchema,
  publicOeuvreQuerySchema,
  adminOeuvresQuerySchema,
} from '../../src/modules/marketplace/oeuvre.schema.js';

const validOeuvre = {
  artisanId: '123e4567-e89b-12d3-a456-426614174111',
  titre: 'Sculpture sur bois',
  description: 'Une magnifique sculpture',
  technique: 'Sculpture main',
  materiaux: 'Bois de teck',
  dimensions: '30x20x40',
  poids: 2.5,
  anneeCreation: 2023,
  prixXOF: 50000,
  categorieId: '123e4567-e89b-12d3-a456-426614174000',
};

describe('createOeuvreSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = createOeuvreSchema.parse(validOeuvre);
    expect(parsed.titre).toBe('Sculpture sur bois');
  });

  it('accepts a payload without optional poids', () => {
    const { poids: _poids, ...rest } = validOeuvre;
    const parsed = createOeuvreSchema.parse(rest);
    expect(parsed.poids).toBeUndefined();
  });

  it('defaults disponibilite to DISPONIBLE when omitted', () => {
    const parsed = createOeuvreSchema.parse(validOeuvre);
    expect(parsed.disponibilite).toBe('DISPONIBLE');
  });

  it('accepts an explicit DISPONIBLE', () => {
    const parsed = createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'DISPONIBLE' });
    expect(parsed.disponibilite).toBe('DISPONIBLE');
  });

  it('accepts an explicit SUR_COMMANDE', () => {
    const parsed = createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'SUR_COMMANDE' });
    expect(parsed.disponibilite).toBe('SUR_COMMANDE');
  });

  it('accepts an explicit EN_EXPOSITION', () => {
    const parsed = createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'EN_EXPOSITION' });
    expect(parsed.disponibilite).toBe('EN_EXPOSITION');
  });

  it('rejects an invalid disponibilite value', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'EPUISEE' })).toThrow();
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'VENDUE' })).toThrow();
  });

  it('rejects a wrong-case disponibilite value', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, disponibilite: 'disponible' })).toThrow();
  });

  it('rejects a payload without required titre', () => {
    const { titre: _titre, ...rest } = validOeuvre;
    expect(() => createOeuvreSchema.parse(rest)).toThrow();
  });

  it('rejects a payload without required artisanId', () => {
    const { artisanId: _artisanId, ...rest } = validOeuvre;
    expect(() => createOeuvreSchema.parse(rest)).toThrow();
  });

  it('rejects an invalid artisanId', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, artisanId: 'not-a-uuid' })).toThrow();
  });

  it('rejects a negative or zero price', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, prixXOF: 0 })).toThrow();
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, prixXOF: -100 })).toThrow();
  });

  it('rejects an invalid categorieId', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, categorieId: 'not-a-uuid' })).toThrow();
  });

  it('rejects an invalid anneeCreation (future year)', () => {
    expect(() =>
      createOeuvreSchema.parse({ ...validOeuvre, anneeCreation: new Date().getFullYear() + 10 })
    ).toThrow();
  });

  it('rejects unknown extra fields (strict mode)', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, statut: 'PUBLIEE' })).toThrow();
  });

  it('rejects a negative poids', () => {
    expect(() => createOeuvreSchema.parse({ ...validOeuvre, poids: -1 })).toThrow();
  });
});

describe('updateOeuvreSchema', () => {
  it('accepts a partial valid payload', () => {
    const parsed = updateOeuvreSchema.parse({ titre: 'Nouveau titre' });
    expect(parsed.titre).toBe('Nouveau titre');
  });

  it('rejects an empty payload', () => {
    expect(() => updateOeuvreSchema.parse({})).toThrow();
  });

  it('rejects forbidden fields like statut', () => {
    expect(() => updateOeuvreSchema.parse({ statut: 'PUBLIEE' })).toThrow();
  });

  it('accepts a valid disponibilite on update', () => {
    const parsed = updateOeuvreSchema.parse({ disponibilite: 'SUR_COMMANDE' });
    expect(parsed.disponibilite).toBe('SUR_COMMANDE');
  });

  it('rejects an invalid disponibilite on update', () => {
    expect(() => updateOeuvreSchema.parse({ disponibilite: 'EPUISEE' })).toThrow();
  });

  it('rejects a wrong-case disponibilite on update', () => {
    expect(() => updateOeuvreSchema.parse({ disponibilite: 'sur_commande' })).toThrow();
  });
});

describe('reorderMediasSchema', () => {
  it('accepts a list of media ids', () => {
    const ids = [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ];
    const parsed = reorderMediasSchema.parse({ mediaIds: ids });
    expect(parsed.mediaIds).toHaveLength(2);
  });

  it('rejects an empty list', () => {
    expect(() => reorderMediasSchema.parse({ mediaIds: [] })).toThrow();
  });

  it('rejects an invalid media id', () => {
    expect(() => reorderMediasSchema.parse({ mediaIds: ['not-a-uuid'] })).toThrow();
  });
});

describe('publicOeuvreQuerySchema', () => {
  it('applies defaults for page and limit', () => {
    const parsed = publicOeuvreQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.tri).toBe('createdAt_desc');
  });

  it('caps limit to 50', () => {
    expect(() => publicOeuvreQuerySchema.parse({ limit: 100 })).toThrow();
    const parsed = publicOeuvreQuerySchema.parse({ limit: 50 });
    expect(parsed.limit).toBe(50);
  });

  it('rejects an invalid artisanType', () => {
    expect(() => publicOeuvreQuerySchema.parse({ artisanType: 'INVALID' })).toThrow();
  });

  it('accepts valid sort orders', () => {
    const parsed = publicOeuvreQuerySchema.parse({ tri: 'prixXOF_asc' });
    expect(parsed.tri).toBe('prixXOF_asc');
  });

  it('accepts a valid disponibilite filter', () => {
    const parsed = publicOeuvreQuerySchema.parse({ disponibilite: 'EN_EXPOSITION' });
    expect(parsed.disponibilite).toBe('EN_EXPOSITION');
  });

  it('rejects an invalid disponibilite filter', () => {
    expect(() => publicOeuvreQuerySchema.parse({ disponibilite: 'EPUISEE' })).toThrow();
  });
});

describe('adminOeuvresQuerySchema', () => {
  it('accepts a valid disponibilite filter', () => {
    const parsed = adminOeuvresQuerySchema.parse({ disponibilite: 'SUR_COMMANDE' });
    expect(parsed.disponibilite).toBe('SUR_COMMANDE');
  });

  it('rejects an invalid disponibilite filter', () => {
    expect(() => adminOeuvresQuerySchema.parse({ disponibilite: 'EPUISEE' })).toThrow();
  });
});
