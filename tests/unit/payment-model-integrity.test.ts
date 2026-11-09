import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '../../prisma/schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

function modelBody(modelName: string): string {
  const modelPattern = new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const modelMatch = schema.match(modelPattern);
  expect(modelMatch, `model ${modelName} should exist`).toBeTruthy();
  return modelMatch![1];
}

function enumBody(enumName: string): string {
  const enumPattern = new RegExp(`enum ${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const enumMatch = schema.match(enumPattern);
  expect(enumMatch, `enum ${enumName} should exist`).toBeTruthy();
  return enumMatch![1];
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe('Payment foundations: enums (schema)', () => {
  it('adds EN_ATTENTE_PAIEMENT to OrderStatus, before COMMANDE workflow states', () => {
    const body = enumBody('OrderStatus');
    expect(body).toContain('EN_ATTENTE_PAIEMENT');
    // La valeur est bien un statut de commande, placé AVANT COMMANDE dans le workflow normal.
    expect(body.indexOf('EN_ATTENTE_PAIEMENT')).toBeLessThan(body.indexOf('COMMANDE'));
    expect(body.indexOf('COMMANDE')).toBeLessThan(body.indexOf('PREPARATION'));
  });

  it('defines a PaymentProvider enum with FEDAPAY', () => {
    expect(enumBody('PaymentProvider')).toContain('FEDAPAY');
  });

  it('defines a PaymentEventTraitementStatus enum for idempotent webhook handling', () => {
    const body = enumBody('PaymentEventTraitementStatus');
    expect(body).toContain('RECU');
    expect(body).toContain('EN_TRAITEMENT');
    expect(body).toContain('TRAITE');
    expect(body).toContain('ECHOUE');
    expect(body).toContain('IGNORE');
  });
});

// ---------------------------------------------------------------------------
// Paiement principal (champs FedaPay préparatoires)
// ---------------------------------------------------------------------------

describe('Paiement model: FedaPay-ready fields', () => {
  const body = modelBody('Paiement');

  it('keeps the existing core fields and the 1-1 link to Commande', () => {
    expect(body).toContain('montant');
    expect(body).toContain('methode');
    expect(body).toContain('statut');
    expect(body).toContain('estEnsequestre');
    expect(body).toMatch(/commandeId\s+String\s+@unique\s+@db\.Uuid/);
  });

  it('stores the payment provider, external reference, status and URL', () => {
    expect(body).toMatch(/prestataire\s+PaymentProvider\?/);
    expect(body).toMatch(/referenceExterne\s+String\?\s+@unique/);
    expect(body).toMatch(/statutExterne\s+String\?/);
    expect(body).toMatch(/urlPaiement\s+String\?/);
    expect(body).toMatch(/devise\s+String\s+@default\("XOF"\)/);
  });

  it('stores the initialization / expiration / confirmation / effective dates', () => {
    expect(body).toMatch(/dateInitialisation\s+DateTime\?/);
    expect(body).toMatch(/dateExpiration\s+DateTime\?/);
    expect(body).toMatch(/dateConfirmation\s+DateTime\?/);
    expect(body).toMatch(/datePaiementEffectif\s+DateTime\?/);
  });

  it('exposes attempts and events relations plus timestamps', () => {
    expect(body).toMatch(/tentatives\s+PaiementTentative\[\]/);
    expect(body).toMatch(/evenements\s+PaiementEvenement\[\]/);
    expect(body).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
  });

  it('stores no API key, secret or banking data', () => {
    expect(body).not.toMatch(/apiKey|api_key|secret|motDePasse|password|iban|cardNumber/i);
  });
});

// ---------------------------------------------------------------------------
// Tentatives de paiement
// ---------------------------------------------------------------------------

describe('PaiementTentative model', () => {
  const body = modelBody('PaiementTentative');

  it('is linked to the parent Paiement with a cascading FK', () => {
    expect(body).toMatch(/paiementId\s+String\s+@db\.Uuid/);
    expect(body).toMatch(
      /paiement\s+Paiement\s+@relation\(fields: \[paiementId\], references: \[id\], onDelete: Cascade\)/
    );
  });

  it('stores its own provider, external reference/status and amounts', () => {
    expect(body).toMatch(/prestataire\s+PaymentProvider/);
    expect(body).toMatch(/referenceExterne\s+String\?\s+@unique/);
    expect(body).toMatch(/statutExterne\s+String\?/);
    expect(body).toMatch(/montant\s+Decimal\s+@db\.Decimal\(12, 0\)/);
  });

  it('reuses PaymentStatus instead of duplicating an enum', () => {
    expect(body).toMatch(/statut\s+PaymentStatus\s+@default\(EN_ATTENTE\)/);
    expect(enumBody('PaymentStatus')).toBeTruthy();
  });

  it('exposes creation/expiration/success dates', () => {
    expect(body).toMatch(/dateCreation\s+DateTime\s+@default\(now\(\)\)/);
    expect(body).toMatch(/dateExpiration\s+DateTime\?/);
    expect(body).toMatch(/dateReussite\s+DateTime\?/);
  });
});

// ---------------------------------------------------------------------------
// Événements de paiement (préparation webhook)
// ---------------------------------------------------------------------------

describe('PaiementEvenement model', () => {
  const body = modelBody('PaiementEvenement');

  it('stores the provider, the stable external event id and the event type', () => {
    expect(body).toMatch(/prestataire\s+PaymentProvider/);
    expect(body).toMatch(/referenceEvenement\s+String\?\s+@unique/);
    expect(body).toMatch(/typeEvenement\s+String/);
    expect(body).toMatch(/referenceTransaction\s+String\?/);
  });

  it('tracks the processing state and reception/processing dates', () => {
    expect(body).toMatch(/statutTraitement\s+PaymentEventTraitementStatus\s+@default\(RECU\)/);
    expect(body).toMatch(/dateReception\s+DateTime\s+@default\(now\(\)\)/);
    expect(body).toMatch(/dateTraitement\s+DateTime\?/);
  });

  it('keeps only a minimal error diagnostic and no raw payload by default', () => {
    expect(body).toMatch(/erreur\s+Json\?\s+@db\.JsonB/);
    expect(body).not.toMatch(/payload\b/i);
  });

  it('stores no secret', () => {
    expect(body).not.toMatch(/apiKey|api_key|secret|motDePasse|password|signature/i);
  });
});

// ---------------------------------------------------------------------------
// BuyerProfile : ID client FedaPay
// ---------------------------------------------------------------------------

describe('BuyerProfile model: FedaPay customer id', () => {
  it('adds a nullable unique fedaPayCustomerId', () => {
    const body = modelBody('BuyerProfile');
    expect(body).toMatch(/fedaPayCustomerId\s+String\?\s+@unique/);
  });
});

// ---------------------------------------------------------------------------
// Migration additive
// ---------------------------------------------------------------------------

describe('add_payment_foundations migration', () => {
  const migrationPath = path.resolve(
    here,
    '../../prisma/migrations/20261010120000_add_payment_foundations/migration.sql'
  );
  const migration = readFileSync(migrationPath, 'utf8');

  it('adds the EN_ATTENTE_PAIEMENT order status', () => {
    expect(migration).toMatch(
      /ALTER TYPE "OrderStatus" ADD VALUE 'EN_ATTENTE_PAIEMENT'/
    );
  });

  it('creates the payment provider and event status enums', () => {
    expect(migration).toContain(`CREATE TYPE "PaymentProvider" AS ENUM ('FEDAPAY')`);
    expect(migration).toContain('CREATE TYPE "PaymentEventTraitementStatus" AS ENUM');
  });

  it('adds the FedaPay-ready columns and the new tables', () => {
    expect(migration).toContain('"referenceExterne" TEXT');
    expect(migration).toContain('CREATE TABLE "paiement_tentatives"');
    expect(migration).toContain('CREATE TABLE "paiement_evenements"');
  });

  it('enforces uniquity of external references and event ids', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "paiements_referenceExterne_key"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "paiement_tentatives_referenceExterne_key"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "paiement_evenements_referenceEvenement_key"'
    );
  });

  it('keeps the default order status at COMMANDE (no premature pending default)', () => {
    expect(migration).not.toMatch(/ALTER TABLE "commandes".*SET DEFAULT 'EN_ATTENTE_PAIEMENT'/s);
  });

  it('is strictly additive (no drops, deletes or truncates)', () => {
    expect(migration).not.toMatch(/^\s*DROP\s+/im);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
    expect(migration).not.toContain('prisma migrate reset');
  });
});
