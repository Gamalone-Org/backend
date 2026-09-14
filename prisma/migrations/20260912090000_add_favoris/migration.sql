-- Migration: Add Favori (Mes favoris acheteur)
--
-- Creates the Favori model (Espace Acheteur → Mes favoris). A Favori links a
-- BuyerProfile to an Oeuvre. The composite unique constraint (acheteurId,
-- oeuvreId) is the database-level guarantee against duplicates for the same
-- (acheteur, oeuvre) pair, even under concurrent requests.
--
-- Additive and non-destructive:
--   - New table favoris
--   - Unique composite constraint + supporting indexes
--   - Foreign keys: favoris -> buyer_profiles (CASCADE), favoris -> oeuvres (CASCADE)
--   - No existing data modified

-- CreateTable
CREATE TABLE "favoris" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "acheteurId" UUID NOT NULL,
    "oeuvreId" UUID NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favoris_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint (acheteurId, oeuvreId)
CREATE UNIQUE INDEX "favoris_acheteurId_oeuvreId_key" ON "favoris"("acheteurId", "oeuvreId");

-- CreateIndex: performance indexes
CREATE INDEX "favoris_acheteurId_dateCreation_idx" ON "favoris"("acheteurId", "dateCreation");
CREATE INDEX "favoris_oeuvreId_idx" ON "favoris"("oeuvreId");

-- AddForeignKey: favoris -> buyer_profiles
ALTER TABLE "favoris" ADD CONSTRAINT "favoris_acheteurId_fkey"
    FOREIGN KEY ("acheteurId") REFERENCES "buyer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: favoris -> oeuvres
ALTER TABLE "favoris" ADD CONSTRAINT "favoris_oeuvreId_fkey"
    FOREIGN KEY ("oeuvreId") REFERENCES "oeuvres"("id") ON DELETE CASCADE ON UPDATE CASCADE;