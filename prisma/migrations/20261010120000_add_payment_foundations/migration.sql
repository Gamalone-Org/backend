-- Migration: Add payment foundations (FedaPay preparation)
--
-- Lot 1 — socle du système de paiement, SANS appel FedaPay.
--
-- Contenu :
--   1. Nouveau statut de commande EN_ATTENTE_PAIEMENT (commande créée en
--      attendant la confirmation du paiement ; les œuvres restent réservées
--      EN_PANIER au lieu de passer VENDUE).
--   2. Enums PaymentProvider (FEDAPAY) et PaymentEventTraitementStatus.
--   3. BuyerProfile.fedaPayCustomerId (ID client FedaPay, unique et nullable).
--   4. Paiement étendu pour préparer FedaPay (prestataire, référence externe,
--      statut externe, URL de paiement, devise, dates), nouveaux
--      createdAt/updatedAt.
--   5. Tables PaiementTentative et PaiementEvenement (préparation webhook).
--
-- Strictement additive et non-destructive :
--   - aucun DROP, aucun DELETE, aucun TRUNCATE, aucune donnée modifiée ;
--   - l'ALTER TYPE ADD VALUE n'est pas utilisé dans la même transaction que
--     son usage, et la valeur par défaut de commandes.statut reste COMMANDE ;
--   - les colonnes ajoutées sont NULL si elles ne disposent pas d'un défaut
--     (paiements existants inchangés, sauf createdAt/updatedAt backfillés).

BEGIN;

-- 1. Nouveau statut de commande : EN_ATTENTE_PAIEMENT (après COMMANDE).
--    La valeur n'est pas utilisée dans cette transaction : l'application la
--    posera à la création des nouvelles commandes (lot courant).
ALTER TYPE "OrderStatus" ADD VALUE 'EN_ATTENTE_PAIEMENT' AFTER 'COMMANDE';

-- 2. Enums prestataire et statut de traitement des événements.
CREATE TYPE "PaymentProvider" AS ENUM ('FEDAPAY');

CREATE TYPE "PaymentEventTraitementStatus" AS ENUM (
  'RECU',
  'EN_TRAITEMENT',
  'TRAITE',
  'ECHOUE',
  'IGNORE'
);

-- 3. BuyerProfile : ID client FedaPay (uniquement, nullable).
ALTER TABLE "buyer_profiles" ADD COLUMN "fedaPayCustomerId" TEXT;

CREATE UNIQUE INDEX "buyer_profiles_fedaPayCustomerId_key" ON "buyer_profiles"("fedaPayCustomerId");

-- 4. Paiement : socle FedaPay + horodatage.
ALTER TABLE "paiements"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "prestataire" "PaymentProvider",
  ADD COLUMN "referenceExterne" TEXT,
  ADD COLUMN "statutExterne" TEXT,
  ADD COLUMN "urlPaiement" TEXT,
  ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'XOF',
  ADD COLUMN "dateInitialisation" TIMESTAMP(3),
  ADD COLUMN "dateExpiration" TIMESTAMP(3),
  ADD COLUMN "dateConfirmation" TIMESTAMP(3),
  ADD COLUMN "datePaiementEffectif" TIMESTAMP(3);

CREATE UNIQUE INDEX "paiements_referenceExterne_key" ON "paiements"("referenceExterne");

CREATE INDEX "paiements_prestataire_statut_idx" ON "paiements"("prestataire", "statut");

-- 5. PaiementTentative : historique non destructif des tentatives (avec la
--    référence de devise prestataire `deviseExterneId`, capturée à l'init pour
--    recontrôler la devise au moment du webhook).
CREATE TABLE "paiement_tentatives" (
    "id" UUID NOT NULL,
    "paiementId" UUID NOT NULL,
    "prestataire" "PaymentProvider" NOT NULL,
    "referenceExterne" TEXT,
    "statut" "PaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "statutExterne" TEXT,
    "montant" DECIMAL(12,0) NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "deviseExterneId" INTEGER,
    "urlPaiement" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateExpiration" TIMESTAMP(3),
    "dateReussite" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paiement_tentatives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paiement_tentatives_referenceExterne_key" ON "paiement_tentatives"("referenceExterne");
CREATE INDEX "paiement_tentatives_paiementId_idx" ON "paiement_tentatives"("paiementId");
CREATE INDEX "paiement_tentatives_statut_idx" ON "paiement_tentatives"("statut");

-- 6. PaiementEvenement : journalisation idempotente des événements prestataire.
CREATE TABLE "paiement_evenements" (
    "id" UUID NOT NULL,
    "prestataire" "PaymentProvider" NOT NULL,
    "referenceEvenement" TEXT,
    "typeEvenement" TEXT NOT NULL,
    "referenceTransaction" TEXT,
    "statutTraitement" "PaymentEventTraitementStatus" NOT NULL DEFAULT 'RECU',
    "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateTraitement" TIMESTAMP(3),
    "erreur" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paiementId" UUID,

    CONSTRAINT "paiement_evenements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paiement_evenements_referenceEvenement_key" ON "paiement_evenements"("referenceEvenement");
CREATE INDEX "paiement_evenements_referenceTransaction_idx" ON "paiement_evenements"("referenceTransaction");
CREATE INDEX "paiement_evenements_statutTraitement_idx" ON "paiement_evenements"("statutTraitement");
CREATE INDEX "paiement_evenements_dateReception_idx" ON "paiement_evenements"("dateReception");

-- 7. Clés étrangères des nouvelles tables.
ALTER TABLE "paiement_tentatives" ADD CONSTRAINT "paiement_tentatives_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paiement_evenements" ADD CONSTRAINT "paiement_evenements_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;