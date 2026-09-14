-- Migration additive (non destructive) : parametres acheteur - preferences de
-- notification (opt-in). Trois colonnes booleennes avec defaut false, sans
-- impact sur les profils existants (aucune donnee a migrer).
-- Aucun envoi de notification n'est declenche par ces colonnes.
ALTER TABLE "buyer_profiles" ADD COLUMN "notificationsEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyer_profiles" ADD COLUMN "notificationsSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "buyer_profiles" ADD COLUMN "notificationsPush" BOOLEAN NOT NULL DEFAULT false;