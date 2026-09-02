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

describe('Artisan type model integrity (schema)', () => {
  it('defines an ArtisanType enum with ARTISAN and ARTISTE', () => {
    const body = enumBody('ArtisanType');
    expect(body).toContain('ARTISAN');
    expect(body).toContain('ARTISTE');
  });

  it('adds a non-nullable type field to ArtisanProfile defaulting to ARTISAN', () => {
    const body = modelBody('ArtisanProfile');
    expect(body).toMatch(/type\s+ArtisanType\s+@default\(ARTISAN\)/);
    expect(body).not.toMatch(/type\s+ArtisanType\?/);
  });

  it('keeps User.role distinct from ArtisanProfile.type', () => {
    const userBody = modelBody('User');
    expect(userBody).toMatch(/role\s+UserRole\s+@default\(ACHETEUR\)/);
  });
});

describe('SousCategorie model integrity (schema)', () => {
  it('defines a SousCategorie model with id, nom, description and categorieId', () => {
    const body = modelBody('SousCategorie').replace(/\s+/g, ' ');
    expect(body).toContain('id String @id @default(uuid()) @db.Uuid');
    expect(body).toContain('nom String');
    expect(body).toContain('description String @db.Text');
    expect(body).toContain('categorieId String @db.Uuid');
    expect(body).toContain('createdAt DateTime @default(now())');
    expect(body).toContain('updatedAt DateTime @updatedAt');
  });

  it('uses a unique constraint on (categorieId, nom)', () => {
    const body = modelBody('SousCategorie');
    expect(body).toContain('@@unique([categorieId, nom])');
  });

  it('indexes categorieId', () => {
    const body = modelBody('SousCategorie');
    expect(body).toContain('@@index([categorieId])');
  });

  it('relates a Category to many SousCategories (1 --- 0..*)', () => {
    const categorieBody = modelBody('Categorie');
    expect(categorieBody).toContain('sousCategories SousCategorie[]');
    const sousBody = modelBody('SousCategorie');
    expect(sousBody).toContain('categorie Categorie @relation(');
  });

  it('uses a non-destructive delete policy for the SousCategorie -> Category FK', () => {
    const body = modelBody('SousCategorie');
    expect(body).toContain('onDelete: Restrict');
    expect(body).not.toContain('onDelete: Cascade');
  });

  it('keeps Oeuvre directly linked to Categorie (V1 data-compatible choice)', () => {
    const oeuvreBody = modelBody('Oeuvre');
    expect(oeuvreBody).toContain('categorieId');
    expect(oeuvreBody).toMatch(/categorie\s+Categorie\s+@relation/);
  });
});

describe('artisan type + sous-categorie migration', () => {
  const migrationPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prisma/migrations/20260828163930_add_artisan_type_and_sous_categorie/migration.sql'
  );
  const migration = readFileSync(migrationPath, 'utf8');

  it('creates the ArtisanType enum', () => {
    expect(migration).toContain(`CREATE TYPE "ArtisanType" AS ENUM ('ARTISAN', 'ARTISTE')`);
  });

  it('adds artisan_profiles.type as NOT NULL with DEFAULT ARTISAN', () => {
    expect(migration).toMatch(
      /ADD COLUMN\s+"type"\s+"ArtisanType"\s+NOT\s+NULL\s+DEFAULT\s+'ARTISAN'/
    );
  });

  it('creates the sous_categories table with unique + index', () => {
    expect(migration).toContain('CREATE TABLE "sous_categories"');
    expect(migration).toContain('CREATE UNIQUE INDEX "sous_categories_categorieId_nom_key"');
    expect(migration).toContain('CREATE INDEX "sous_categories_categorieId_idx"');
  });

  it('applies a non-destructive FK (RESTRICT, never CASCADE) and no data deletion', () => {
    expect(migration).toContain('ON DELETE RESTRICT');
    expect(migration).not.toContain('ON DELETE CASCADE');
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
  });
});
