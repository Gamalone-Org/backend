-- CreateEnum
CREATE TYPE "ArtisanType" AS ENUM ('ARTISAN', 'ARTISTE');

-- AlterTable
ALTER TABLE "artisan_profiles" ADD COLUMN     "type" "ArtisanType" NOT NULL DEFAULT 'ARTISAN';

-- CreateTable
CREATE TABLE "sous_categories" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categorieId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sous_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sous_categories_categorieId_idx" ON "sous_categories"("categorieId");

-- CreateIndex
CREATE UNIQUE INDEX "sous_categories_categorieId_nom_key" ON "sous_categories"("categorieId", "nom");

-- AddForeignKey
ALTER TABLE "sous_categories" ADD CONSTRAINT "sous_categories_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
