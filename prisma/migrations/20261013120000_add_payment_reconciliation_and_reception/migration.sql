-- Lot 4 : suivi des paiements côté acheteur et admin, signalement des anomalies
-- et confirmation de réception par l'acheteur.
--
-- Migration strictement additive : aucune colonne, table ni donnée n'est
-- supprimée. Elle est indépendante de la migration du lot 1
-- (`20261010120000_add_payment_foundations`) : elle ne touche que des tables
-- préexistantes (`paiements`, `livraisons`) et peut être appliquée après elle.

-- 1) Signalement d'anomalie de paiement : deux transactions approuvées pour une
-- même commande. L'indicateur est posé par le webhook, sans double transition
-- métier, afin qu'un administrateur procède à la réconciliation manuelle.
ALTER TABLE "paiements"
  ADD COLUMN "reconciliationRequise" BOOLEAN NOT NULL DEFAULT false;

-- 2) Confirmation de réception par l'acheteur : point de départ du délai prévu
-- pour le futur reversement artisan. Aucun reversement n'est déclenché ici.
ALTER TABLE "livraisons"
  ADD COLUMN "dateReceptionConfirmee" TIMESTAMP(3);
