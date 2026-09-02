import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prisma/schema.prisma'
);
const schema = readFileSync(schemaPath, 'utf8');

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations/20260901000000_add_articles_module/migration.sql'
);
const migration = readFileSync(migrationPath, 'utf8');

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

describe('Module Articles - intégrité du modèle Article', () => {
  it('defines an ArticleStatus enum with only the three workflow statuses', () => {
    const body = enumBody('ArticleStatus');
    expect(body).toContain('BROUILLON');
    expect(body).toContain('PLANIFIE');
    expect(body).toContain('PUBLIE');
    const statuses = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));
    expect(statuses).toEqual(['BROUILLON', 'PLANIFIE', 'PUBLIE']);
  });

  it('defines the Article model with the required business fields', () => {
    const body = modelBody('Article').replace(/\s+/g, ' ');
    expect(body).toContain('id String @id @default(uuid()) @db.Uuid');
    expect(body).toContain('titre String');
    expect(body).toContain('contenu String @db.Text');
    expect(body).toContain('slug String @unique');
    expect(body).toContain('metaDescription String? @db.Text');
    expect(body).toContain('statut ArticleStatus @default(BROUILLON)');
    expect(body).toContain('datePublication DateTime?');
    expect(body).toContain('datePlanification DateTime?');
    expect(body).toContain('categorieId String @db.Uuid');
    expect(body).toContain('imageCouvertureUrl String?');
    expect(body).toContain('imageCouverturePublicId String?');
    expect(body).toContain('deletedAt DateTime?');
    expect(body).toContain('createdAt DateTime @default(now())');
    expect(body).toContain('updatedAt DateTime @updatedAt');
  });

  it('links the article to an AdminProfile author (traceable, not a second user system)', () => {
    const body = modelBody('Article').replace(/\s+/g, ' ');
    expect(body).toContain('auteurId String @db.Uuid');
    expect(body).toMatch(/auteur\s+AdminProfile\s+@relation\("ArticleAuthor"/);
    const adminBody = modelBody('AdminProfile').replace(/\s+/g, ' ');
    expect(adminBody).toContain('authoredArticles Article[] @relation("ArticleAuthor")');
  });

  it('records the publishing admin separately from the author', () => {
    const body = modelBody('Article').replace(/\s+/g, ' ');
    expect(body).toMatch(/publishedByAdminId\s+String\?/);
    expect(body).toMatch(/publishedByAdmin\s+AdminProfile\?/);
    const adminBody = modelBody('AdminProfile').replace(/\s+/g, ' ');
    expect(adminBody).toContain('articles Article[] @relation("ArticlePublication")');
  });

  it('uses a non-destructive delete policy (soft delete via deletedAt)', () => {
    const body = modelBody('Article').replace(/\s+/g, ' ');
    expect(body).toContain('deletedAt DateTime?');
    expect(body).toContain('onDelete: SetNull');
  });

  it('no longer defines a redundant ArticleCategory model', () => {
    expect(schema).not.toMatch(/model\s+ArticleCategory\s*\{/);
  });

  it('relates Article to the global Categorie with a restricting FK', () => {
    const articleBody = modelBody('Article').replace(/\s+/g, ' ');
    expect(articleBody).toMatch(/categorie\s+Categorie\s+@relation\(.*onDelete: Restrict/);
    const categorieBody = modelBody('Categorie').replace(/\s+/g, ' ');
    expect(categorieBody).toContain('articles Article[]');
  });
});

describe('Module Articles - intégrité de la migration', () => {
  const MIGRATION_NAME = '20260901000000_add_articles_module';

  it('exists with the expected folder name', () => {
    expect(migrationPath).toContain(MIGRATION_NAME);
  });

  it('creates the ArticleStatus enum with exactly three values', () => {
    expect(migration).toContain(
      `CREATE TYPE "ArticleStatus" AS ENUM ('BROUILLON', 'PLANIFIE', 'PUBLIE')`
    );
  });

  it('creates the articles table referencing categories (no article_categories)', () => {
    expect(migration).toContain('CREATE TABLE "articles"');
    expect(migration).not.toContain('CREATE TABLE "article_categories"');
    expect(migration).toMatch(/REFERENCES "categories" \("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/);
  });

  it('enforces a unique slug on articles', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "articles_slug_key"');
  });

  it('indexes the article category, status, author and dates', () => {
    expect(migration).toContain('CREATE INDEX "articles_categorieId_idx"');
    expect(migration).toContain('CREATE INDEX "articles_statut_idx"');
    expect(migration).toContain('CREATE INDEX "articles_auteurId_idx"');
    expect(migration).toContain('CREATE INDEX "articles_datePublication_idx"');
  });

  it('is purely additive and non-destructive', () => {
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
    expect(migration).not.toMatch(/DROP\s+TABLE/im);
    expect(migration).not.toMatch(/DROP\s+COLUMN/im);
    expect(migration).not.toContain('ON DELETE CASCADE');
  });
});
