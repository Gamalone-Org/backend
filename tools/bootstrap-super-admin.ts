#!/usr/bin/env node

/**
 * Bootstrap du premier SUPER_ADMIN (idempotent).
 *
 * Usage :
 *   npm run bootstrap:super-admin -- --telephone=+22890123456 --motDePasse='S3cretPass!' \
 *     --nom='Awa Mensah' --email=awa@exemple.com --departement='Direction'
 *   BOOTSTRAP_ADMIN_TELEPHONE=+22890123456 BOOTSTRAP_ADMIN_MOTDEPASSE='...' npm run bootstrap:super-admin
 *
 * Règles de sécurité respectées :
 * - JAMAIS de mot de passe ou identifiants hardcodés (CLI ou variables
 *   d'environnement uniquement) ;
 * - JAMAIS d'affichage du mot de passe ou d'un hash en clair ;
 * - refuse de s'exécuter si un SUPER_ADMIN actif existe déjà ;
 * - le hash est généré avec le même PasswordService (scrypt) que l'API.
 */

// Charge dotenv en premier, comme le font server.ts et prisma.config.ts,
// afin que les variables definies dans le fichier .env (DATABASE_URL,
// BOOTSTRAP_ADMIN_*, ...) soient bien prises en compte.
import 'dotenv/config';

import { prisma } from '../src/config/database.js';
import { BootstrapSuperAdminService } from '../src/modules/admin/administrateurs/bootstrap-super-admin.service.js';

const bootstrapService = new BootstrapSuperAdminService(prisma);

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) {
    return hit.slice(prefix.length);
  }
  const envKey = `BOOTSTRAP_ADMIN_${name.toUpperCase()}`;
  return process.env[envKey];
}

function requiredArg(name: string): string {
  const value = argValue(name);
  if (!value || value.length === 0) {
    console.error(
      `❌ Argument requis manquant : --${name}=... ou BOOTSTRAP_ADMIN_${name.toUpperCase()}`
    );
    process.exit(1);
  }
  return value;
}

function usage(): void {
  console.error(
    'Usage: npm run bootstrap:super-admin -- --telephone=+228XXXXXXXX --motDePasse=... ' +
      '[--nom=...] [--email=...] [--departement=...]'
  );
}

async function main(): Promise<void> {
  try {
    const telephone = requiredArg('telephone');
    const motDePasse = requiredArg('motDePasse');
    const nom = argValue('nom');
    const email = argValue('email');
    const departement = argValue('departement');

    const result = await bootstrapService.execute({
      telephone,
      motDePasse,
      nom,
      email,
      departement,
    });

    console.log('✅ Premier SUPER_ADMIN créé avec succès.');
    console.log(`   Téléphone : ${result.telephone}`);
    console.log(`   Nom : ${result.nom || '(non renseigné)'}`);
    console.log(`   Email : ${result.email ?? '(non renseigné)'}`);
    console.log(`   Département : ${result.departement || '(non renseigné)'}`);
    console.log('   (le mot de passe n’est jamais affiché)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Aucun secret ne doit apparaître : on n'affiche que le message d'erreur
    // métier, jamais le mot de passe ni un hash.
    console.error(`❌ Bootstrap impossible : ${message}`);
    usage();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
