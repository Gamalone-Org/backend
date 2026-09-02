-- AlterTable: Add marketplace fields to oeuvres
ALTER TABLE "oeuvres" ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "estMiseEnAvant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add ordre column to media for ordering
ALTER TABLE "media" ADD COLUMN "ordre" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Index for featured queries
CREATE INDEX "oeuvres_estMiseEnAvant_idx" ON "oeuvres"("estMiseEnAvant");

-- CreateIndex: Composite index for media ordering
CREATE INDEX "media_oeuvreId_ordre_idx" ON "media"("oeuvreId", "ordre");
