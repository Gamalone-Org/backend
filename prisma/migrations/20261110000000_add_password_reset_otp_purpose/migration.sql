-- Migration additive : nouveau but OTP pour la réinitialisation du mot de passe.
-- N'altère ni ne supprime aucune valeur existante de l'enum OtpPurpose :
-- les lignes déjà créées gardent leur but (SIGNUP / LOGIN / PHONE_VERIFICATION).
-- L'ajout d'une valeur à un enum existant est une opération additive en Postgres.

ALTER TYPE "OtpPurpose" ADD VALUE 'PASSWORD_RESET';