-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('EN_ATTENTE', 'EN_TRAITEMENT', 'VERSE', 'ECHOUE', 'RECONCILIATION_REQUISE');

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "commandeArtisanId" UUID NOT NULL,
    "artisanId" UUID NOT NULL,
    "commandeId" UUID NOT NULL,
    "montantBrut" DECIMAL(12,0) NOT NULL,
    "commission" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "montantNet" DECIMAL(12,0) NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "methode" "ArtisanPaiementMethode" NOT NULL,
    "prestataire" "PaymentProvider",
    "statut" "PayoutStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "referenceExterne" TEXT,
    "statutExterne" TEXT,
    "modeExterne" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateDeclenchement" TIMESTAMP(3),
    "dateConfirmation" TIMESTAMP(3),
    "erreur" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_tentatives" (
    "id" UUID NOT NULL,
    "payoutId" UUID NOT NULL,
    "prestataire" "PaymentProvider" NOT NULL,
    "referenceExterne" TEXT,
    "statut" "PayoutStatus" NOT NULL DEFAULT 'EN_TRAITEMENT',
    "statutExterne" TEXT,
    "montant" DECIMAL(12,0) NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "modeExterne" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateEnvoi" TIMESTAMP(3),
    "dateReussite" TIMESTAMP(3),
    "erreur" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_tentatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payouts_commandeArtisanId_key" ON "payouts"("commandeArtisanId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_referenceExterne_key" ON "payouts"("referenceExterne");

-- CreateIndex
CREATE UNIQUE INDEX "payout_tentatives_referenceExterne_key" ON "payout_tentatives"("referenceExterne");

-- CreateIndex
CREATE INDEX "payout_tentatives_payoutId_idx" ON "payout_tentatives"("payoutId");

-- CreateIndex
CREATE INDEX "payout_tentatives_statut_idx" ON "payout_tentatives"("statut");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_commandeArtisanId_fkey" FOREIGN KEY ("commandeArtisanId") REFERENCES "commande_artisan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_tentatives" ADD CONSTRAINT "payout_tentatives_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
