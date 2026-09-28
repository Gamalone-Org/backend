-- Migration: Module Categories Article - systeme independant des categories d'oeuvres
--
-- Objectif : separer les deux systemes de categories qui etaient melanges.
--   categories          -> catalogue/marketplace des oeuvres  (INCHANGE)
--   categories_articles -> categories des articles / blog     (NOUVEAU)
--
-- Additive et non destructif :
--   - nouvelle table "categories_articles"
--   - les categories reellement utilisees par des articles sont COPIEES
--     dans la nouvelle table afin de conserver les associations existantes
--   - meme si une categorie d'oeuvre porte le meme nom qu'une categorie
--     d'article, ce sont deux lignes distinctes dans deux tables distinctes
--   - la colonne "articles"."categorieId" garde son nom et sa colonne
--     (aucun renommage, aucun DROP COLUMN) : seule la table ciblee par la
--     cle etrangere change
--   - aucune donnee supprimee, aucun DROP TABLE, aucun TRUNCATE

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nouvelle table des categories d'articles
-- ---------------------------------------------------------------------------

CREATE TABLE "categories_articles" (
  "id"                      UUID           NOT NULL,
  "nom"                     TEXT           NOT NULL,
  "description"             TEXT           NOT NULL,
  "slug"                    TEXT           NOT NULL,
  "imageCouvertureUrl"      TEXT,
  "imageCouverturePublicId" TEXT,
  "statut"                  "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)   NOT NULL,

  CONSTRAINT "categories_articles_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2. Conservation des categories et associations des articles existants
--
-- On copie une ligne par categorie d'oeuvre distincte effectivement
-- referencee par au moins un article, en conservant le meme identifiant
-- (uuid) : "articles"."categorieId" reste donc valide sans aucune mise a
-- jour de donnee.
--
-- La colonne "position" n'existe pas dans le nouveau modele, et
-- "sous_categories" est propre au catalogue des oeuvres : seules les
-- colonnes communes sont copiees.
-- ---------------------------------------------------------------------------

INSERT INTO "categories_articles" (
  "id",
  "nom",
  "description",
  "slug",
  "imageCouvertureUrl",
  "imageCouverturePublicId",
  "statut",
  "createdAt",
  "updatedAt"
)
SELECT
  c."id",
  c."nom",
  c."description",
  c."slug",
  c."imageCouvertureUrl",
  c."imageCouverturePublicId",
  c."statut",
  c."createdAt",
  c."updatedAt"
FROM "categories" c
WHERE EXISTS (
  SELECT 1
  FROM "articles" a
  WHERE a."categorieId" = c."id"
);

-- ---------------------------------------------------------------------------
-- 3. Retargetage de la cle etrangere des articles
-- ---------------------------------------------------------------------------

-- L'ancienne contrainte pointait sur "categories".
ALTER TABLE "articles" DROP CONSTRAINT "articles_categorieId_fkey";

ALTER TABLE "articles"
  ADD CONSTRAINT "articles_categorieId_fkey"
  FOREIGN KEY ("categorieId")
  REFERENCES "categories_articles" ("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Retrait de la relation Article < categorie cote catalogue
--
-- Le modele "Categorie" ne porte plus d'articles : il reste attache
-- uniquement aux oeuvres et aux sous-categories, son comportement est
-- inchange. La contrainte n'existait pas en base (relation deduite de
-- "articles_categorieId_fkey"), le DROP ci-dessus suffit a la lever.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Index de la nouvelle table
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "categories_articles_nom_key" ON "categories_articles"("nom");
CREATE UNIQUE INDEX "categories_articles_slug_key" ON "categories_articles"("slug");
CREATE INDEX "categories_articles_slug_idx" ON "categories_articles"("slug");
CREATE INDEX "categories_articles_statut_idx" ON "categories_articles"("statut");

COMMIT;
