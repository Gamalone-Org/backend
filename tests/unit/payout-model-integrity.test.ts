import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.resolve(here, '../../prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  path.resolve(here, '../../prisma/migrations/20261014120000_add_artisan_payouts/migration.sql'),
  'utf8'
);

function modelBody(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match, `model ${modelName} should exist`).toBeTruthy();
  return match![1];
}

function enumBody(enumName: string): string {
  const match = schema.match(new RegExp(`enum ${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match, `enum ${enumName} should exist`).toBeTruthy();
  return match![1];
}

describe('Payout foundations: schema', () => {
  it('defines a dedicated PayoutStatus enum', () => {
    const body = enumBody('PayoutStatus');
    for (const value of ['EN_ATTENTE', 'EN_TRAITEMENT', 'VERSE', 'ECHOUE', 'RECONCILIATION_REQUISE']) {
      expect(body).toContain(value);
    }
  });

  it('enforces a single payout per artisan sub-order', () => {
    const body = modelBody('Payout');
    expect(body).toMatch(/commandeArtisanId\s+String\s+@unique\s+@db\.Uuid/);
    expect(body).toMatch(/referenceExterne\s+String\?\s+@unique/);
  });

  it('stores monetary snapshots and never recomputes them', () => {
    const body = modelBody('Payout');
    expect(body).toMatch(/montantBrut\s+Decimal\s+@db\.Decimal\(12, 0\)/);
    expect(body).toMatch(/commission\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(12, 0\)/);
    expect(body).toMatch(/montantNet\s+Decimal\s+@db\.Decimal\(12, 0\)/);
    expect(body).toMatch(/devise\s+String\s+@default\("XOF"\)/);
  });

  it('stores no raw banking credentials', () => {
    const body = modelBody('Payout') + modelBody('PayoutTentative');
    expect(body).not.toMatch(/\biban\b|cardNumber|motDePasse|password|apiKey|secret/i);
  });

  it('links the payout to the sub-order (cascade), artisan (restrict) and command', () => {
    const body = modelBody('Payout');
    expect(body).toMatch(
      /commandeArtisan\s+CommandeArtisan\s+@relation\(fields: \[commandeArtisanId\], references: \[id\], onDelete: Cascade\)/
    );
    expect(body).toMatch(
      /artisan\s+ArtisanProfile\s+@relation\(fields: \[artisanId\], references: \[id\], onDelete: Restrict\)/
    );
    expect(body).toMatch(
      /commande\s+Commande\s+@relation\(fields: \[commandeId\], references: \[id\], onDelete: Cascade\)/
    );
  });

  it('reuses PayoutStatus on attempts and keeps their history', () => {
    const body = modelBody('PayoutTentative');
    expect(body).toMatch(/statut\s+PayoutStatus\s+@default\(EN_TRAITEMENT\)/);
    expect(body).toMatch(/referenceExterne\s+String\?\s+@unique/);
    expect(body).toMatch(/montant\s+Decimal\s+@db\.Decimal\(12, 0\)/);
    expect(body).toMatch(
      /payout\s+Payout\s+@relation\(fields: \[payoutId\], references: \[id\], onDelete: Cascade\)/
    );
  });
});

describe('add_artisan_payouts migration', () => {
  it('creates the PayoutStatus enum and both tables', () => {
    expect(migration).toContain('CREATE TYPE "PayoutStatus" AS ENUM');
    expect(migration).toContain('CREATE TABLE "payouts"');
    expect(migration).toContain('CREATE TABLE "payout_tentatives"');
  });

  it('enforces uniqueness on the sub-order and the external reference', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "payouts_commandeArtisanId_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "payouts_referenceExterne_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "payout_tentatives_referenceExterne_key"');
  });

  it('defaults the payout status to EN_ATTENTE and currency to XOF', () => {
    expect(migration).toContain(`"statut" "PayoutStatus" NOT NULL DEFAULT 'EN_ATTENTE'`);
    expect(migration).toContain(`"devise" TEXT NOT NULL DEFAULT 'XOF'`);
  });

  it('is strictly additive (no drops, deletes or truncates)', () => {
    expect(migration).not.toMatch(/^\s*DROP\s+/im);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
    expect(migration).not.toContain('prisma migrate reset');
  });
});
