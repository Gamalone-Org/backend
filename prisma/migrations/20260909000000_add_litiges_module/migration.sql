-- Migration: Module Litiges - Centre de résolution des litiges clients / artisans
--
-- Additive and non-destructive:
--   - new enum DisputeStatus (OUVERT, EN_COURS, RESOLU) aligned on the admin
--     maquette statuses (Ouvert / En cours / Résolu)
--   - new table litiges, minimal socle for the admin reading ops:
--       motif        free-text description of the dispute (no invented taxonomy)
--       statut       dispute lifecycle status (no workflow transitions in Phase 1)
--       commandeId   FK -> commandes (client via commande.acheteur -> users)
--       artisanId    FK -> artisan_profiles (one specific artisan per dispute;
--                    a multi-artisan order can carry several disputes)
--   - no existing data modified, no dangerous Orders/Payments change.

BEGIN;

-- 1. New dispute status enum (values mirror the maquette chips).
CREATE TYPE "DisputeStatus" AS ENUM ('OUVERT', 'EN_COURS', 'RESOLU');

-- 2. Litiges (commandeId -> commandes, artisanId -> artisan_profiles).
CREATE TABLE "litiges" (
  "id"         UUID            NOT NULL,
  "motif"      TEXT            NOT NULL,
  "statut"     "DisputeStatus" NOT NULL DEFAULT 'OUVERT',
  "commandeId" UUID            NOT NULL,
  "artisanId"  UUID            NOT NULL,
  "createdAt"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "litiges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "litiges_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "litiges_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Indexes for admin list/search/filters (commandeId, artisanId, statut).
CREATE INDEX "litiges_commandeId_idx" ON "litiges" ("commandeId");
CREATE INDEX "litiges_artisanId_idx" ON "litiges" ("artisanId");
CREATE INDEX "litiges_statut_idx" ON "litiges" ("statut");

COMMIT;