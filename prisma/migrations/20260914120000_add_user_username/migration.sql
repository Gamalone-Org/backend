-- Migration additive (non destructive) : ajout d'un username optionnel et
-- unique sur les utilisateurs, sans impact sur les comptes existants.
-- PostgreSQL accepte plusieurs NULL dans une colonne unique : les utilisateurs
-- existants sans username restent valides.
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");