#!/usr/bin/env node

/**
 * Seed Prisma 7 idempotent et production-safe du SUPER_ADMIN.
 *
 * Exécutable depuis CI/CD (Render) : `npx prisma db seed` (après migrate deploy).
 *
 * Règles de sécurité :
 * - attente : le seed NÉCESSITE BOOTSTRAP_ADMIN_TELEPHONE et
 *   BOOTSTRAP_ADMIN_PASSWORD sinon il échoue avec les variables listées ;
 * - le mot de passe est lu depuis BOOTSTRAP_ADMIN_PASSWORD, jamais affiché,
 *   jamais journalisé, jamais écrit en clair ;
 * - si un SUPER_ADMIN actif existe déjà : aucun doublon, aucun reset du mot de
 *   passe. Seule réparation autorisée : username/email NULL.
 * - le seed ne touche JAMAIS aux autres utilisateurs.
 *
 * Ne jamais afficher de secret dans les logs.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  readSuperAdminSeedEnv,
  SuperAdminSeedService,
} from '../src/modules/admin/administrateurs/super-admin-seed.service.js';

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      "Variable d'environnement manquante « DATABASE_URL » : impossible de se connecter à la base. " +
        'Aucun compte n’a été créé ni modifié.'
    );
  }

  const input = readSuperAdminSeedEnv();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const service = new SuperAdminSeedService(prisma);
    const result = await service.execute(input);

    switch (result.action) {
      case 'created':
        console.log('✅ SUPER_ADMIN créé avec succès.');
        break;
      case 'repaired':
        console.log('✅ SUPER_ADMIN existant complété (champ(s) manquant(s) renseigné(s)).');
        console.log('   Mot de passe, rôle, statut et autres données inchangés.');
        break;
      case 'unchanged':
        console.log('ℹ️ SUPER_ADMIN existant : aucune modification nécessaire.');
        break;
    }

    console.log(`   Action : ${result.action}`);
    console.log(`   Username : ${result.username ?? '(non renseigné)'}`);
    console.log(`   Email : ${result.email ?? '(non renseigné)'}`);
    console.log('   (le mot de passe n’est jamais affiché)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Seed SUPER_ADMIN impossible : ${message}`);
  process.exit(1);
});