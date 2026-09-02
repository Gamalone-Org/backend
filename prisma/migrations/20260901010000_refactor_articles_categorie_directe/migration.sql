-- Migration: Refactor articles -> use global Categorie directly
--
-- Removes the redundant "article_categories" system so that Article points
-- directly at the global "categories" table, like Oeuvre does.
--
-- Idempotent / non-destructive:
--   - Repoints articles.categorieId to categories.id
--   - Drops the now-unused article_categories table
--   - No data is deleted (article_categories was empty)
--   - Safe to run on fresh installs (migration 20260901000000 rewritten)
--     as well as on existing databases that still have article_categories.

BEGIN;

DO $$
BEGIN
  -- 1. Repoint the FK when article_categories still exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'article_categories'
  ) THEN
    -- Drop the old FK pointing at article_categories.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'articles_categorieId_fkey'
        AND conrelid = 'public.articles'::regclass
    ) THEN
      ALTER TABLE "public"."articles"
        DROP CONSTRAINT "articles_categorieId_fkey";
    END IF;

    -- Add the FK pointing at categories.
    ALTER TABLE "public"."articles"
      ADD CONSTRAINT "articles_categorieId_fkey"
      FOREIGN KEY ("categorieId") REFERENCES "public"."categories" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;

    -- Drop the now-unused table (empty, no data loss).
    DROP TABLE IF EXISTS "public"."article_categories";
  END IF;
END $$;

COMMIT;
