-- Migration: Add commercial availability to artworks
--
-- Adds a new ArtworkAvailability enum (DISPONIBLE / SUR_COMMANDE / EN_EXPOSITION)
-- and a NOT NULL column on oeuvres defaulting to DISPONIBLE, plus an index.
--
-- Additive and non-destructive:
--   - New enum ArtworkAvailability
--   - New column oeuvres.disponibilite (existing rows become DISPONIBLE)
--   - New index on disponibilite for admin/public list filtering
--   - No existing data modified

-- CreateEnum
CREATE TYPE "ArtworkAvailability" AS ENUM ('DISPONIBLE', 'SUR_COMMANDE', 'EN_EXPOSITION');

-- AlterTable
ALTER TABLE "oeuvres" ADD COLUMN "disponibilite" "ArtworkAvailability" NOT NULL DEFAULT 'DISPONIBLE';

-- CreateIndex
CREATE INDEX "oeuvres_disponibilite_idx" ON "oeuvres"("disponibilite");