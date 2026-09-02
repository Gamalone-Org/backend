-- Migration: Categorie / SousCategorie - slug, image couverture, statut, position
--
-- Additive and non-destructive:
--   - new enum CategoryStatus (ACTIVE, INACTIVE)
--   - new columns on categories and sous_categories
--   - backfill of the unique `slug` columns from the existing `nom`
--   - no data deleted, no reset.

BEGIN;

-- 1. New status enum.
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- 2. Categorie: add new columns.
ALTER TABLE "categories"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "imageCouvertureUrl" TEXT,
  ADD COLUMN "imageCouverturePublicId" TEXT,
  ADD COLUMN "statut" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- 3. Backfill slugs on existing rows (empty in practice, robust anyway).
UPDATE "categories"
SET "slug" = lower(regexp_replace(regexp_replace("nom", '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
WHERE "slug" IS NULL;

-- 4. Guarantee non-null + uniqueness on categories.slug.
UPDATE "categories" SET "slug" = 'categorie-' || "id" WHERE "slug" = '';
ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" ("slug");
CREATE INDEX "categories_statut_idx" ON "categories" ("statut");

-- 5. SousCategorie: add new columns.
ALTER TABLE "sous_categories"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "imageCouvertureUrl" TEXT,
  ADD COLUMN "imageCouverturePublicId" TEXT,
  ADD COLUMN "statut" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- 6. Backfill slugs on existing sous-category rows.
UPDATE "sous_categories"
SET "slug" = lower(regexp_replace(regexp_replace("nom", '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
WHERE "slug" IS NULL;

UPDATE "sous_categories" SET "slug" = 'sous-categorie-' || "id" WHERE "slug" = '';
ALTER TABLE "sous_categories" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "sous_categories_slug_key" ON "sous_categories" ("slug");
CREATE INDEX "sous_categories_statut_idx" ON "sous_categories" ("statut");

COMMIT;
