-- Migration additive : colonne consumedForResetAt pour marquer la consommation
-- atomique de l'autorisation de réinitialisation (OTP PASSWORD_RESET).
-- Cette colonne est indexée et NULL par défaut (non consommé).

ALTER TABLE "otp_codes" ADD COLUMN "consumedForResetAt" TIMESTAMP(3);

CREATE INDEX "otp_codes_consumed_for_reset_idx" ON "otp_codes"("consumedForResetAt");