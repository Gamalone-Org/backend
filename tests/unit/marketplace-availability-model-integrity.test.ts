import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prisma/schema.prisma'
);
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

describe('ArtworkAvailability model integrity (schema)', () => {
  it('defines an ArtworkAvailability enum with the three commercial states', () => {
    const body = enumBody('ArtworkAvailability');
    expect(body).toContain('DISPONIBLE');
    expect(body).toContain('SUR_COMMANDE');
    expect(body).toContain('EN_EXPOSITION');
  });

  it('excludes EPUISEE and VENDUE from the commercial availability enum', () => {
    const body = enumBody('ArtworkAvailability');
    expect(body).not.toContain('EPUISEE');
    expect(body).not.toContain('VENDUE');
  });

  it('adds a non-nullable disponibilite field defaulting to DISPONIBLE', () => {
    const body = modelBody('Oeuvre');
    expect(body).toMatch(/disponibilite\s+ArtworkAvailability\s+@default\(DISPONIBLE\)/);
    expect(body).not.toMatch(/disponibilite\s+ArtworkAvailability\?/);
  });

  it('indexes disponibilite for list filtering', () => {
    const body = modelBody('Oeuvre');
    expect(body).toContain('@@index([disponibilite])');
  });

  it('keeps the lifecycle statut path entirely unchanged', () => {
    const body = modelBody('Oeuvre');
    expect(body).toMatch(/statut\s+ArtworkStatus\s+@default\(BROUILLON\)/);
    const statutEnum = enumBody('ArtworkStatus');
    expect(statutEnum).toContain('BROUILLON');
    expect(statutEnum).toContain('EN_ATTENTE_VALIDATION');
    expect(statutEnum).toContain('PUBLIEE');
    expect(statutEnum).toContain('EN_PANIER');
    expect(statutEnum).toContain('VENDUE');
    expect(statutEnum).toContain('RETIREE');
  });
});

describe('add_artwork_availability migration', () => {
  const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prisma/migrations/20260908000000_add_artwork_availability/migration.sql'
  );
  const migration = readFileSync(migrationPath, 'utf8');

  it('creates the ArtworkAvailability enum', () => {
    expect(migration).toContain(
      `CREATE TYPE "ArtworkAvailability" AS ENUM ('DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION')`
    );
  });

  it('backfills existing oeuvres to DISPONIBLE via NOT NULL DEFAULT (no data rewrite)', () => {
    expect(migration).toMatch(
      /ADD COLUMN\s+"disponibilite"\s+"ArtworkAvailability"\s+NOT\s+NULL\s+DEFAULT\s+'DISPONIBLE'/
    );
  });

  it('creates the availability index', () => {
    expect(migration).toContain('CREATE INDEX "oeuvres_disponibilite_idx" ON "oeuvres"("disponibilite")');
  });

  it('is strictly additive (no table drops, deletes or truncates)', () => {
    expect(migration).not.toMatch(/^\s*DROP\s+/im);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
  });
});