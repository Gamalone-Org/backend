-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('CNI_RECTO', 'CNI_VERSO', 'PASSEPORT', 'TITRE_SEJOUR', 'JUSTIFICATIF_DOMICILE', 'PHOTO_SELFIE', 'EXTRAIT_KBIS', 'DOCUMENT_COMPLEMENTAIRE');

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "kycId" UUID NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "format" TEXT,
    "bytes" INTEGER NOT NULL,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_documents_kycId_idx" ON "kyc_documents"("kycId");

-- CreateIndex
CREATE INDEX "kyc_documents_kycId_documentType_idx" ON "kyc_documents"("kycId", "documentType");

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
