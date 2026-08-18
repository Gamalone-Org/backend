/*
  Warnings:

  - A unique constraint covering the columns `[telephone]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PhoneVerificationStatus" AS ENUM ('NON_VERIFIE', 'EN_ATTENTE_VERIFICATION', 'VERIFIE', 'BLOQUE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'PHONE_VERIFICATION');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('EN_ATTENTE', 'UTILISE', 'EXPIRE', 'BLOQUE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "KycReviewAction" AS ENUM ('APPROUVER', 'REJETER', 'DEMANDE_CORRECTION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "telephoneVerificationStatus" "PhoneVerificationStatus" NOT NULL DEFAULT 'NON_VERIFIE',
ADD COLUMN     "telephoneVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "motDePasse" DROP NOT NULL;

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "status" "OtpStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'BROUILLON',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" UUID,
    "rejectionReason" TEXT,
    "resubmissionOfId" UUID,
    "identityData" JSONB,
    "professionData" JSONB,
    "additionalInfo" JSONB,
    "addressData" JSONB,
    "identityDocument" JSONB,
    "supportingDocs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_codes_phone_purpose_status_idx" ON "otp_codes"("phone", "purpose", "status");

-- CreateIndex
CREATE INDEX "otp_codes_userId_idx" ON "otp_codes"("userId");

-- CreateIndex
CREATE INDEX "kyc_records_userId_status_idx" ON "kyc_records"("userId", "status");

-- CreateIndex
CREATE INDEX "kyc_records_reviewedByAdminId_idx" ON "kyc_records"("reviewedByAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "users_telephone_key" ON "users"("telephone");

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_resubmissionOfId_fkey" FOREIGN KEY ("resubmissionOfId") REFERENCES "kyc_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
