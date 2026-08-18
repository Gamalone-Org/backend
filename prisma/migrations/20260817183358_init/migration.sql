-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ACHETEUR', 'ARTISAN', 'ADMIN');

-- CreateEnum
CREATE TYPE "ArtisanSubscription" AS ENUM ('GRATUIT', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "AdminAccessLevel" AS ENUM ('SUPPORT', 'MODERATEUR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "BuyerType" AS ENUM ('PARTICULIER', 'PROFESSIONNEL', 'COLLECTIONNEUR');

-- CreateEnum
CREATE TYPE "ArtworkStatus" AS ENUM ('BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'VENDUE', 'RETIREE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION', 'EXPEDIEE', 'LIVREE', 'ANNULEE', 'REMBOURSEE');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('STANDARD', 'SUR_MESURE', 'ENCHERE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARTE_BANCAIRE', 'MOBILE_MONEY', 'VIREMENT', 'ESPECES');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'REUSSI', 'ECHOUE', 'REMBOURSE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('EN_ATTENTE', 'PREPAREE', 'EXPEDIEE', 'EN_TRANSIT', 'LIVREE', 'ECHEC');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "statut" "UserStatus" NOT NULL DEFAULT 'EN_ATTENTE_VALIDATION',
    "role" "UserRole" NOT NULL DEFAULT 'ACHETEUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artisan_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "nomAtelier" TEXT NOT NULL,
    "specialite" TEXT NOT NULL,
    "biographie" TEXT NOT NULL,
    "localisation" TEXT NOT NULL,
    "anneesExperience" INTEGER NOT NULL,
    "estCertifie" BOOLEAN NOT NULL DEFAULT false,
    "scoreFiabilite" DECIMAL(5,2),
    "liensReseauxSociaux" JSONB,
    "abonnement" "ArtisanSubscription" NOT NULL DEFAULT 'GRATUIT',
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "validatedByAdminId" UUID,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artisan_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "niveauAcces" "AdminAccessLevel" NOT NULL DEFAULT 'SUPPORT',
    "departement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "adresseLivraison" TEXT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "typeClient" "BuyerType" NOT NULL DEFAULT 'PARTICULIER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oeuvres" (
    "id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technique" TEXT NOT NULL,
    "materiaux" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "poids" DOUBLE PRECISION,
    "anneeCreation" INTEGER NOT NULL,
    "prixXOF" DECIMAL(12,0) NOT NULL,
    "statut" "ArtworkStatus" NOT NULL DEFAULT 'BROUILLON',
    "artisanId" UUID NOT NULL,
    "categorieId" UUID NOT NULL,
    "publishedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oeuvres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "oeuvreId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificats" (
    "id" UUID NOT NULL,
    "codeQR" TEXT NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hashOeuvre" TEXT NOT NULL,
    "estValide" BOOLEAN NOT NULL DEFAULT true,
    "oeuvreId" UUID NOT NULL,

    CONSTRAINT "certificats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commandes" (
    "id" UUID NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "OrderStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "montantTotal" DECIMAL(12,0) NOT NULL,
    "commission" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "typeCommande" "OrderType" NOT NULL DEFAULT 'STANDARD',
    "fraisLivraison" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "acheteurId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commandes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_commandes" (
    "id" UUID NOT NULL,
    "commandeId" UUID NOT NULL,
    "oeuvreId" UUID NOT NULL,
    "artisanId" UUID NOT NULL,
    "prixUnitaire" DECIMAL(12,0) NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ligne_commandes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" UUID NOT NULL,
    "montant" DECIMAL(12,0) NOT NULL,
    "methode" "PaymentMethod" NOT NULL,
    "statut" "PaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estEnsequestre" BOOLEAN NOT NULL DEFAULT false,
    "commandeId" UUID NOT NULL,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "livraisons" (
    "id" UUID NOT NULL,
    "transporteur" TEXT NOT NULL,
    "numeroSuivi" TEXT,
    "statut" "DeliveryStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "adresseDest" TEXT NOT NULL,
    "frais" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "commandeId" UUID NOT NULL,

    CONSTRAINT "livraisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avis" (
    "id" UUID NOT NULL,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT NOT NULL,
    "dateAvis" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estVerifie" BOOLEAN NOT NULL DEFAULT false,
    "commandeId" UUID NOT NULL,

    CONSTRAINT "avis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_telephone_idx" ON "users"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "artisan_profiles_userId_key" ON "artisan_profiles"("userId");

-- CreateIndex
CREATE INDEX "artisan_profiles_validatedByAdminId_idx" ON "artisan_profiles"("validatedByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_userId_key" ON "admin_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "buyer_profiles_userId_key" ON "buyer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_nom_key" ON "categories"("nom");

-- CreateIndex
CREATE INDEX "oeuvres_artisanId_idx" ON "oeuvres"("artisanId");

-- CreateIndex
CREATE INDEX "oeuvres_categorieId_idx" ON "oeuvres"("categorieId");

-- CreateIndex
CREATE INDEX "oeuvres_statut_idx" ON "oeuvres"("statut");

-- CreateIndex
CREATE INDEX "media_oeuvreId_idx" ON "media"("oeuvreId");

-- CreateIndex
CREATE UNIQUE INDEX "certificats_codeQR_key" ON "certificats"("codeQR");

-- CreateIndex
CREATE UNIQUE INDEX "certificats_oeuvreId_key" ON "certificats"("oeuvreId");

-- CreateIndex
CREATE INDEX "commandes_acheteurId_idx" ON "commandes"("acheteurId");

-- CreateIndex
CREATE INDEX "commandes_statut_idx" ON "commandes"("statut");

-- CreateIndex
CREATE INDEX "ligne_commandes_commandeId_idx" ON "ligne_commandes"("commandeId");

-- CreateIndex
CREATE INDEX "ligne_commandes_oeuvreId_idx" ON "ligne_commandes"("oeuvreId");

-- CreateIndex
CREATE INDEX "ligne_commandes_artisanId_idx" ON "ligne_commandes"("artisanId");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_commandeId_key" ON "paiements"("commandeId");

-- CreateIndex
CREATE UNIQUE INDEX "livraisons_commandeId_key" ON "livraisons"("commandeId");

-- CreateIndex
CREATE UNIQUE INDEX "avis_commandeId_key" ON "avis"("commandeId");

-- AddForeignKey
ALTER TABLE "artisan_profiles" ADD CONSTRAINT "artisan_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artisan_profiles" ADD CONSTRAINT "artisan_profiles_validatedByAdminId_fkey" FOREIGN KEY ("validatedByAdminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oeuvres" ADD CONSTRAINT "oeuvres_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oeuvres" ADD CONSTRAINT "oeuvres_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oeuvres" ADD CONSTRAINT "oeuvres_publishedByAdminId_fkey" FOREIGN KEY ("publishedByAdminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_oeuvreId_fkey" FOREIGN KEY ("oeuvreId") REFERENCES "oeuvres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificats" ADD CONSTRAINT "certificats_oeuvreId_fkey" FOREIGN KEY ("oeuvreId") REFERENCES "oeuvres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_acheteurId_fkey" FOREIGN KEY ("acheteurId") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commandes" ADD CONSTRAINT "ligne_commandes_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commandes" ADD CONSTRAINT "ligne_commandes_oeuvreId_fkey" FOREIGN KEY ("oeuvreId") REFERENCES "oeuvres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_commandes" ADD CONSTRAINT "ligne_commandes_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "livraisons" ADD CONSTRAINT "livraisons_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avis" ADD CONSTRAINT "avis_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomCheckConstraint: note entre 1 et 5 (non supporté nativement par Prisma)
ALTER TABLE "avis" ADD CONSTRAINT "avis_note_range" CHECK ("note" >= 1 AND "note" <= 5);
