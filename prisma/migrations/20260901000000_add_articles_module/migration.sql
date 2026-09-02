-- Migration: Module Articles - Éditorial Admin
--
-- Additive and non-destructive:
--   - new enum ArticleStatus (BROUILLON, PLANIFIE, PUBLIE)
--   - new table articles
--   - Articles reference the global "categories" table directly
--     (no redundant article_categories table)
--   - no data deleted, no reset.

BEGIN;

-- 1. New article status enum.
CREATE TYPE "ArticleStatus" AS ENUM ('BROUILLON', 'PLANIFIE', 'PUBLIE');

-- 2. Articles (categorieId -> categories).
CREATE TABLE "articles" (
  "id"                      UUID           NOT NULL,
  "titre"                   TEXT           NOT NULL,
  "contenu"                 TEXT           NOT NULL,
  "slug"                    TEXT           NOT NULL,
  "metaDescription"         TEXT,
  "statut"                  "ArticleStatus" NOT NULL DEFAULT 'BROUILLON',
  "datePublication"         TIMESTAMP(3),
  "datePlanification"       TIMESTAMP(3),
  "categorieId"             UUID           NOT NULL,
  "imageCouvertureUrl"      TEXT,
  "imageCouverturePublicId" TEXT,
  "auteurId"                UUID           NOT NULL,
  "publishedByAdminId"      UUID,
  "deletedAt"               TIMESTAMP(3),
  "createdAt"               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "articles_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "articles_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "admin_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "articles_publishedByAdminId_fkey" FOREIGN KEY ("publishedByAdminId") REFERENCES "admin_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 3. Uniqueness + indexes.
CREATE UNIQUE INDEX "articles_slug_key" ON "articles" ("slug");
CREATE INDEX "articles_slug_idx" ON "articles" ("slug");
CREATE INDEX "articles_categorieId_idx" ON "articles" ("categorieId");
CREATE INDEX "articles_statut_idx" ON "articles" ("statut");
CREATE INDEX "articles_auteurId_idx" ON "articles" ("auteurId");
CREATE INDEX "articles_datePublication_idx" ON "articles" ("datePublication");
CREATE INDEX "articles_deletedAt_idx" ON "articles" ("deletedAt");

COMMIT;
