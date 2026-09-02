-- CreateEnum: MediaType (OEUVRE / PREPARATION / ATELIER)
CREATE TYPE "MediaType" AS ENUM ('OEUVRE', 'PREPARATION', 'ATELIER');

-- AlterTable: Add photo atelier single-slot fields to artisan_profiles
ALTER TABLE "artisan_profiles"
  ADD COLUMN "photoAtelierUrl" TEXT,
  ADD COLUMN "photoAtelierPublicId" TEXT,
  ADD COLUMN "photoAtelierMimeType" TEXT,
  ADD COLUMN "photoAtelierSize" INTEGER;

-- AlterTable: Add media type to media (default OEUVRE for existing rows)
ALTER TABLE "media"
  ADD COLUMN "type" "MediaType" NOT NULL DEFAULT 'OEUVRE';

-- CreateIndex: Composite index for per-type media counts per oeuvre
CREATE INDEX "media_oeuvreId_type_idx" ON "media"("oeuvreId", "type");
