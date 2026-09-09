-- CreateTable: CommandeArtisan
CREATE TABLE "commande_artisan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "commandeId" UUID NOT NULL,
    "artisanId" UUID NOT NULL,
    "statut" "OrderStatus" NOT NULL DEFAULT 'COMMANDE',
    "sousTotal" DECIMAL(12,0) NOT NULL,
    "commission" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "fraisLivraison" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "montantTotal" DECIMAL(12,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commande_artisan_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add commandeArtisanId to ligne_commandes (nullable for backward compatibility)
ALTER TABLE "ligne_commandes" ADD COLUMN "commandeArtisanId" UUID;

-- CreateIndex: unique constraint (commandeId, artisanId)
CREATE UNIQUE INDEX "commande_artisan_commandeId_artisanId_key" ON "commande_artisan"("commandeId", "artisanId");

-- CreateIndex: performance indexes
CREATE INDEX "commande_artisan_commandeId_idx" ON "commande_artisan"("commandeId");
CREATE INDEX "commande_artisan_artisanId_idx" ON "commande_artisan"("artisanId");
CREATE INDEX "commande_artisan_statut_idx" ON "commande_artisan"("statut");
CREATE INDEX "ligne_commandes_commandeArtisanId_idx" ON "ligne_commandes"("commandeArtisanId");

-- AddForeignKey: commande_artisan -> commandes
ALTER TABLE "commande_artisan" ADD CONSTRAINT "commande_artisan_commandeId_fkey"
    FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: commande_artisan -> artisan_profiles
ALTER TABLE "commande_artisan" ADD CONSTRAINT "commande_artisan_artisanId_fkey"
    FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ligne_commandes -> commande_artisan (nullable)
ALTER TABLE "ligne_commandes" ADD CONSTRAINT "ligne_commandes_commandeArtisanId_fkey"
    FOREIGN KEY ("commandeArtisanId") REFERENCES "commande_artisan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
