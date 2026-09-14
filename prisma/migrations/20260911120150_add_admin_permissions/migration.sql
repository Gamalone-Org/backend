-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('ADMINS_READ', 'ADMINS_CREATE', 'ADMINS_UPDATE', 'ADMINS_MANAGE', 'USERS_READ', 'USERS_UPDATE', 'ARTISANS_READ', 'ARTISANS_UPDATE', 'KYC_READ', 'KYC_REVIEW', 'KYC_VALIDATE', 'ARTWORKS_READ', 'ARTWORKS_CREATE', 'ARTWORKS_UPDATE', 'ARTWORKS_DELETE', 'ARTWORKS_PUBLISH', 'CATEGORIES_READ', 'CATEGORIES_MANAGE', 'ORDERS_READ', 'ORDERS_UPDATE', 'DISPUTES_READ', 'DISPUTES_MANAGE', 'ARTICLES_READ', 'ARTICLES_CREATE', 'ARTICLES_UPDATE', 'ARTICLES_DELETE', 'ARTICLES_PUBLISH', 'DELIVERIES_READ', 'DELIVERIES_UPDATE', 'REVIEWS_READ', 'DASHBOARD_READ');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('CREATE_ADMIN', 'UPDATE_ADMIN', 'UPDATE_ADMIN_PERMISSIONS', 'ACTIVATE_ADMIN', 'DEACTIVATE_ADMIN');

-- DropIndex
DROP INDEX "sous_categories_statut_idx";

-- AlterTable
ALTER TABLE "artisan_atelier_photos" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "artisan_payment_preferences" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "boutique_settings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commande_artisan" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "creation_processus" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "expositions" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "admin_profile_permissions" (
    "adminProfileId" UUID NOT NULL,
    "permission" "AdminPermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_profile_permissions_pkey" PRIMARY KEY ("adminProfileId","permission")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "actorAdminId" UUID,
    "targetAdminId" UUID,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_profile_permissions_permission_idx" ON "admin_profile_permissions"("permission");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "admin_audit_logs_actorAdminId_idx" ON "admin_audit_logs"("actorAdminId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetAdminId_idx" ON "admin_audit_logs"("targetAdminId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "categories_slug_idx" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "sous_categories_slug_idx" ON "sous_categories"("slug");

-- AddForeignKey
ALTER TABLE "admin_profile_permissions" ADD CONSTRAINT "admin_profile_permissions_adminProfileId_fkey" FOREIGN KEY ("adminProfileId") REFERENCES "admin_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_targetAdminId_fkey" FOREIGN KEY ("targetAdminId") REFERENCES "admin_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
