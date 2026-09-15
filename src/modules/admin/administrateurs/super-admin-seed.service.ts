import {
  type PrismaClient,
  type Prisma,
} from '../../../generated/prisma/client.js';
import {
  ConflictError,
  ValidationError,
} from '../../../common/errors/AppError.js';
import { PasswordService } from '../../auth/services/PasswordService.js';
import { PhoneService } from '../../auth/services/PhoneService.js';
import { isValidUsername, normalizeUsername } from '../../auth/username.js';
import {
  BootstrapSuperAdminService,
  type BootstrapSuperAdminInput,
  type BootstrapSuperAdminResult,
} from './bootstrap-super-admin.service.js';

export type SuperAdminSeedInput = {
  telephone: string;
  motDePasse: string;
  username?: string;
  email?: string;
};

export type SuperAdminSeedResult = {
  action: 'created' | 'repaired' | 'unchanged';
  userId: string;
  adminProfileId?: string;
  username: string | null;
  email: string | null;
  details: string;
};

type ActiveSuperAdmin = {
  id: string;
  username: string | null;
  email: string | null;
};

const ACTIVE_SUPER_ADMIN_WHERE = {
  role: 'ADMIN',
  statut: 'ACTIF',
  adminProfile: { is: { niveauAcces: 'SUPER_ADMIN' } },
} satisfies Prisma.UserWhereInput;

/**
 * Identifiant username OFFICIEL du premier SUPER_ADMIN GAMALONE.
 *
 * « g.apedo » est un identifiant de connexion PUBLIC (non secret), non
 * journalisable comme tel — contrairement au mot de passe qui n'a JAMAIS de
 * valeur par défaut ni d'affichage (BOOTSTRAP_ADMIN_PASSWORD demeure requis et
 * est seulement transporté par l'environnement). Une valeur par défaut pour le
 * username est donc cohérente avec les règles de sécurité du seed : un username
 * n'est ni un secret ni un mot de passe, et il est déjà transporté, documenté
 * et testé comme tel (fixtures seed + CLI + schema @unique Prisma).
 */
export const OFFICIAL_SUPER_ADMIN_USERNAME = 'g.apedo' as const;

/**
 * Description déclarative des variables d'environnement du seed SUPER_ADMIN.
 *
 * - `nom` : nom exact de la variable dans process.env ;
 * - `requis` : true si absente => le seed refuse de s'exécuter sans aucune
 *   écriture en base (liste les variables manquantes, validation stricte).
 *
 * BOOTSTRAP_ADMIN_USERNAME et BOOTSTRAP_ADMIN_EMAIL sont optionnels : ils ne
 * servent qu'à compléter un username/email NULL côté cible, jamais pour
 * réinitialiser un mot de passe (qui reste toujours requis et secret).
 */
const SEED_ENV_VARS: ReadonlyArray<{ nom: string; requis: boolean }> = [
  { nom: 'BOOTSTRAP_ADMIN_TELEPHONE', requis: true },
  { nom: 'BOOTSTRAP_ADMIN_PASSWORD', requis: true },
  { nom: 'BOOTSTRAP_ADMIN_USERNAME', requis: false },
  { nom: 'BOOTSTRAP_ADMIN_EMAIL', requis: false },
];

/**
 * Lit l'environnement du seed SUPER_ADMIN (production-safe).
 *
 * - les variables REQUISES sont BOOTSTRAP_ADMIN_TELEPHONE et
 *   BOOTSTRAP_ADMIN_PASSWORD ; sans elles le seed refuse de s'exécuter et liste
 *   les variables manquantes (aucune écriture en base) ;
 * - le mot de passe n'est jamais affiché ni journalisé ;
 * - les valeurs username/email sont optionnelles et normalisées avant usage
 *   (le seed ne les réinjectera que s'ils sont NULL côté cible, jamais pris).
 */
export function readSuperAdminSeedEnv(): SuperAdminSeedInput {
  const manquantes = SEED_ENV_VARS.filter(({ nom, requis }) => {
    if (!requis) return false;
    const valeur = process.env[nom]?.trim();
    return !valeur;
  }).map(({ nom }) => nom);

  if (manquantes.length > 0) {
    throw new ValidationError(
      `Variables d'environnement requises absentes : ${manquantes.join(', ')}. ` +
        'Aucun compte n’a été créé ni modifié.'
    );
  }

  const telephone = (process.env['BOOTSTRAP_ADMIN_TELEPHONE'] ?? '').trim();
  const motDePasse = process.env['BOOTSTRAP_ADMIN_PASSWORD'] ?? '';
  const username =
    process.env['BOOTSTRAP_ADMIN_USERNAME']?.trim() || OFFICIAL_SUPER_ADMIN_USERNAME;
  const email = process.env['BOOTSTRAP_ADMIN_EMAIL']?.trim() || undefined;

  if (telephone && !thisPhoneServiceNormalizable(telephone)) {
    throw new ValidationError(
      'Téléphone SUPER_ADMIN invalide (format attendu : indicatif + numéro, ' +
        'p.ex. +2290102030405).'
    );
  }

  return { telephone, motDePasse, username, email };
}

function thisPhoneServiceNormalizable(telephone: string): boolean {
  const p = new PhoneService();
  try {
    p.normalize(telephone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Seed idempotent et production-safe du SUPER_ADMIN (Prisma 7).
 *
 * Objectif : garantir l'existence d'au moins un SUPER_ADMIN actif, à partir des
 * variables d'environnement, sans jamais réinitialiser de mot de passe ni
 * créer de doublon.
 *
 * Comportement :
 * - aucun SUPER_ADMIN actif -> délègue au service de bootstrap officiel
 *   (création atomique User + AdminProfile dans une transaction) ;
 * - un SUPER_ADMIN actif existe déjà -> aucune création, aucun doublon, et
 *   JAMAIS de réinitialisation du mot de passe. Seule "réparation" possible :
 *   compléter username/email uniquement s'ils sont NULL, s'ils sont fournis par
 *   les variables d'environnement et s'ils ne sont pas déjà pris par un autre
 *   compte. Toujours sans ambiguïté (refus si plusieurs cibles possibles).
 */
export class SuperAdminSeedService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordService: PasswordService = new PasswordService(),
    private readonly phoneService: PhoneService = new PhoneService()
  ) {}

  async execute(input: SuperAdminSeedInput): Promise<SuperAdminSeedResult> {
    const activeSuperAdmins = await this.prisma.user.findMany({
      where: ACTIVE_SUPER_ADMIN_WHERE,
      select: {
        id: true,
        username: true,
        email: true,
      },
    });

    if (activeSuperAdmins.length === 0) {
      return this.createSuperAdmin(input);
    }

    if (activeSuperAdmins.length > 1) {
      return {
        action: 'unchanged',
        userId: activeSuperAdmins[0]?.id ?? '',
        username: activeSuperAdmins[0]?.username ?? null,
        email: activeSuperAdmins[0]?.email ?? null,
        details:
          `${activeSuperAdmins.length} SUPER_ADMIN actifs détectés : aucune ` +
          'modification (cible ambiguë).',
      };
    }

    const target = activeSuperAdmins[0] as ActiveSuperAdmin;
    return this.repairSuperAdmin(target, input);
  }

  private createSuperAdmin(
    input: SuperAdminSeedInput
  ): Promise<SuperAdminSeedResult> {
    const bootstrap = new BootstrapSuperAdminService(
      this.prisma,
      this.passwordService,
      this.phoneService
    );

    const createInput: BootstrapSuperAdminInput = {
      telephone: input.telephone,
      motDePasse: input.motDePasse,
      username: input.username,
      email: input.email,
    };

    return bootstrap.execute(createInput).then((result: BootstrapSuperAdminResult) => ({
      action: 'created' as const,
      userId: result.userId,
      adminProfileId: result.adminProfileId,
      username: result.username,
      email: result.email,
      details:
        'SUPER_ADMIN créé (User role=ADMIN / statut=ACTIF / ' +
        'telephoneVerificationStatus=VERIFIE + AdminProfile niveauAcces=SUPER_ADMIN).',
    }));
  }

  private async repairSuperAdmin(
    target: ActiveSuperAdmin,
    input: SuperAdminSeedInput
  ): Promise<SuperAdminSeedResult> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let repaired = false;
      const notes: string[] = [];

      const username = input.username ? normalizeUsername(input.username) : null;
      if (username && target.username === null) {
        if (!isValidUsername(username)) {
          throw new ValidationError(
            'Username invalide : 3-30 caractères (a-z, 0-9, point, tiret, underscore), en minuscules, sans espace.'
          );
        }
        const usedBy = await tx.user.findUnique({
          where: { username },
          select: { id: true },
        });
        if (usedBy && usedBy.id !== target.id) {
          throw new ConflictError(
            `Le username « ${username} » appartient déjà à un autre compte : aucune modification effectuée.`
          );
        }
        await tx.user.update({
          where: { id: target.id },
          data: { username },
        });
        repaired = true;
        notes.push('username');
        target.username = username;
      }

      const email = input.email ? input.email.trim().toLowerCase() : null;
      if (email && target.email === null) {
        const usedBy = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (usedBy && usedBy.id !== target.id) {
          throw new ConflictError(
            `L'adresse e-mail « ${email} » appartient déjà à un autre compte : aucune modification effectuée.`
          );
        }
        await tx.user.update({
          where: { id: target.id },
          data: { email },
        });
        repaired = true;
        notes.push('email');
        target.email = email;
      }

      return {
        action: (repaired ? 'repaired' : 'unchanged') as 'repaired' | 'unchanged',
        userId: target.id,
        username: target.username,
        email: target.email,
        details: repaired
          ? `SUPER_ADMIN existant complété (${notes.join(', ')}). Mot de passe, rôle et statut inchangés.`
          : 'SUPER_ADMIN existant : aucune modification nécessaire.',
      };
    });
  }
}
