-- Migration additive : reversements manuels groupés par artisan.
-- N'altère ni ne supprime aucune table existante (payouts, encaissements FedaPay).

-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('EN_ATTENTE', 'VERSE', 'ANNULE');

-- CreateEnum
CREATE TYPE "PayoutManualMethod" AS ENUM ('MOBILE_MONEY', 'VIREMENT_BANCAIRE');

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" UUID NOT NULL,
    "artisanId" UUID NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "montantTotal" DECIMAL(12,0) NOT NULL,
    "statut" "PayoutBatchStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "preparedById" UUID NOT NULL,
    "confirmedById" UUID,
    "datePreparation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateConfirmation" TIMESTAMP(3),
    "dateAnnulation" TIMESTAMP(3),
    "moyenPaiement" "PayoutManualMethod",
    "referenceTransfert" VARCHAR(255),
    "note" TEXT,
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batch_lines" (
    "id" UUID NOT NULL,
    "payoutBatchId" UUID NOT NULL,
    "commandeArtisanId" UUID NOT NULL,
    "activeReservationKey" UUID,
    "montantBrut" DECIMAL(12,0) NOT NULL,
    "commission" DECIMAL(12,0) NOT NULL,
    "montantNet" DECIMAL(12,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_batch_annulations" (
    "id" UUID NOT NULL,
    "payoutBatchId" UUID NOT NULL,
    "annulledById" UUID NOT NULL,
    "motif" TEXT NOT NULL,
    "dateAnnulation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_batch_annulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_batches_artisanId_statut_datePreparation_idx" ON "payout_batches"("artisanId", "statut", "datePreparation");

-- CreateIndex
CREATE INDEX "payout_batches_preparedById_idx" ON "payout_batches"("preparedById");

-- CreateIndex
CREATE INDEX "payout_batches_confirmedById_idx" ON "payout_batches"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batch_lines_activeReservationKey_key" ON "payout_batch_lines"("activeReservationKey");

-- CreateIndex
CREATE INDEX "payout_batch_lines_payoutBatchId_idx" ON "payout_batch_lines"("payoutBatchId");

-- CreateIndex
CREATE INDEX "payout_batch_lines_commandeArtisanId_idx" ON "payout_batch_lines"("commandeArtisanId");

-- CreateIndex
CREATE INDEX "payout_batch_lines_activeReservationKey_idx" ON "payout_batch_lines"("activeReservationKey");

-- CreateIndex
CREATE INDEX "payout_batch_annulations_payoutBatchId_idx" ON "payout_batch_annulations"("payoutBatchId");

-- CreateIndex
CREATE INDEX "payout_batch_annulations_annulledById_idx" ON "payout_batch_annulations"("annulledById");

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_lines" ADD CONSTRAINT "payout_batch_lines_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_lines" ADD CONSTRAINT "payout_batch_lines_commandeArtisanId_fkey" FOREIGN KEY ("commandeArtisanId") REFERENCES "commande_artisan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_annulations" ADD CONSTRAINT "payout_batch_annulations_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batch_annulations" ADD CONSTRAINT "payout_batch_annulations_annulledById_fkey" FOREIGN KEY ("annulledById") REFERENCES "admin_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
