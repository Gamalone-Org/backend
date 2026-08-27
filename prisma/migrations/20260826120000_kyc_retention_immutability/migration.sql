-- AlterTable
ALTER TABLE "users" ADD COLUMN "anonymizedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kyc_records" ADD COLUMN "retentionUntil" TIMESTAMP(3),
ADD COLUMN "anonymizedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "kyc_documents" ADD COLUMN "retentionUntil" TIMESTAMP(3),
ADD COLUMN "anonymizedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kyc_review_history" ADD COLUMN "adminProfileIdSnapshot" UUID,
ADD COLUMN "adminDepartementSnapshot" TEXT,
ADD COLUMN "adminNiveauAccesSnapshot" "AdminAccessLevel";

-- DropForeignKey
ALTER TABLE "kyc_records" DROP CONSTRAINT "kyc_records_userId_fkey";

-- DropForeignKey
ALTER TABLE "kyc_review_history" DROP CONSTRAINT "kyc_review_history_kycId_fkey";

-- DropForeignKey
ALTER TABLE "kyc_review_history" DROP CONSTRAINT "kyc_review_history_adminId_fkey";

-- DropForeignKey
ALTER TABLE "kyc_documents" DROP CONSTRAINT "kyc_documents_kycId_fkey";

-- AlterTable
ALTER TABLE "kyc_review_history" ALTER COLUMN "adminId" DROP NOT NULL;

-- Backfill immutable admin snapshots for existing review history rows
UPDATE "kyc_review_history" AS h
SET
  "adminProfileIdSnapshot" = h."adminId",
  "adminDepartementSnapshot" = a."departement",
  "adminNiveauAccesSnapshot" = a."niveauAcces"
FROM "admin_profiles" AS a
WHERE h."adminId" = a."id"
  AND h."adminProfileIdSnapshot" IS NULL;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review_history" ADD CONSTRAINT "kyc_review_history_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review_history" ADD CONSTRAINT "kyc_review_history_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "users_anonymizedAt_idx" ON "users"("anonymizedAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "kyc_records_retentionUntil_idx" ON "kyc_records"("retentionUntil");

-- CreateIndex
CREATE INDEX "kyc_records_deletedAt_idx" ON "kyc_records"("deletedAt");

-- CreateIndex
CREATE INDEX "kyc_records_anonymizedAt_idx" ON "kyc_records"("anonymizedAt");

-- CreateIndex
CREATE INDEX "kyc_records_legalHold_idx" ON "kyc_records"("legalHold");

-- CreateIndex
CREATE INDEX "kyc_documents_retentionUntil_idx" ON "kyc_documents"("retentionUntil");

-- CreateIndex
CREATE INDEX "kyc_documents_deletedAt_idx" ON "kyc_documents"("deletedAt");

-- CreateIndex
CREATE INDEX "kyc_review_history_adminProfileIdSnapshot_idx" ON "kyc_review_history"("adminProfileIdSnapshot");
