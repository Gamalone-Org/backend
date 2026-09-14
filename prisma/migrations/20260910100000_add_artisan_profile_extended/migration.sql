-- CreateEnum
CREATE TYPE "ArtisanDevise" AS ENUM ('XOF', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "ArtisanLangue" AS ENUM ('fr', 'en');

-- CreateEnum
CREATE TYPE "ArtisanPaiementMethode" AS ENUM ('MOBILE_MONEY', 'VIREMENT_BANCAIRE');

-- AlterTable: ArtisanProfile — photo profil, bannière, informations étendues, présentation, boutique
ALTER TABLE "artisan_profiles" ADD COLUMN "photoProfilUrl" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoProfilPublicId" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoProfilMimeType" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoProfilSize" INTEGER;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoBanniereUrl" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoBannierePublicId" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoBanniereMimeType" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "photoBanniereSize" INTEGER;
ALTER TABLE "artisan_profiles" ADD COLUMN "anneeCreation" INTEGER;
ALTER TABLE "artisan_profiles" ADD COLUMN "ville" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "pays" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "bioCourte" VARCHAR(500);
ALTER TABLE "artisan_profiles" ADD COLUMN "histoire" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "siteWeb" TEXT;
ALTER TABLE "artisan_profiles" ADD COLUMN "devise" "ArtisanDevise" NOT NULL DEFAULT 'XOF';
ALTER TABLE "artisan_profiles" ADD COLUMN "langue" "ArtisanLangue" NOT NULL DEFAULT 'fr';
ALTER TABLE "artisan_profiles" ADD COLUMN "preparationMinDays" INTEGER;
ALTER TABLE "artisan_profiles" ADD COLUMN "preparationMaxDays" INTEGER;

-- CreateTable: Photos atelier multiples
CREATE TABLE "artisan_atelier_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artisanId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artisan_atelier_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Processus de création
CREATE TABLE "creation_processus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artisanId" UUID NOT NULL,
    "ordre" INTEGER NOT NULL,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "photoMimeType" TEXT,
    "photoSize" INTEGER,
    "legende" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creation_processus_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Expositions
CREATE TABLE "expositions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artisanId" UUID NOT NULL,
    "annee" INTEGER NOT NULL,
    "evenement" TEXT NOT NULL,
    "lieu" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Paramètres boutique
CREATE TABLE "boutique_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artisanId" UUID NOT NULL,
    "devise" "ArtisanDevise" NOT NULL DEFAULT 'XOF',
    "langue" "ArtisanLangue" NOT NULL DEFAULT 'fr',
    "preparationMinDays" INTEGER,
    "preparationMaxDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boutique_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Préférences de versement
CREATE TABLE "artisan_payment_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artisanId" UUID NOT NULL,
    "methode" "ArtisanPaiementMethode" NOT NULL,
    "mobileMoneyOperateur" TEXT,
    "mobileMoneyNumero" TEXT,
    "virementNomBanque" TEXT,
    "virementIban" TEXT,
    "virementNomCompte" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artisan_payment_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artisan_atelier_photos_artisanId_idx" ON "artisan_atelier_photos"("artisanId");
CREATE INDEX "artisan_atelier_photos_artisanId_ordre_idx" ON "artisan_atelier_photos"("artisanId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "creation_processus_artisanId_ordre_key" ON "creation_processus"("artisanId", "ordre");
CREATE INDEX "creation_processus_artisanId_idx" ON "creation_processus"("artisanId");

-- CreateIndex
CREATE INDEX "expositions_artisanId_idx" ON "expositions"("artisanId");
CREATE INDEX "expositions_artisanId_annee_idx" ON "expositions"("artisanId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "boutique_settings_artisanId_key" ON "boutique_settings"("artisanId");

-- CreateIndex
CREATE UNIQUE INDEX "artisan_payment_preferences_artisanId_key" ON "artisan_payment_preferences"("artisanId");

-- AddForeignKey
ALTER TABLE "artisan_atelier_photos" ADD CONSTRAINT "artisan_atelier_photos_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_processus" ADD CONSTRAINT "creation_processus_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expositions" ADD CONSTRAINT "expositions_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boutique_settings" ADD CONSTRAINT "boutique_settings_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artisan_payment_preferences" ADD CONSTRAINT "artisan_payment_preferences_artisanId_fkey" FOREIGN KEY ("artisanId") REFERENCES "artisan_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
