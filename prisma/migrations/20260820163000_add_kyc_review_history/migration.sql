-- CreateTable
CREATE TABLE "kyc_review_history" (
    "id" UUID NOT NULL,
    "kycId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "action" "KycReviewAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_review_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_review_history_kycId_idx" ON "kyc_review_history"("kycId");

-- CreateIndex
CREATE INDEX "kyc_review_history_adminId_idx" ON "kyc_review_history"("adminId");

-- AddForeignKey
ALTER TABLE "kyc_review_history" ADD CONSTRAINT "kyc_review_history_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review_history" ADD CONSTRAINT "kyc_review_history_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
