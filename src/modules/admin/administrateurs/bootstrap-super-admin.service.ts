import { type PrismaClient, type Prisma } from '../../../generated/prisma/client.js';
import { ConflictError, ValidationError } from '../../../common/errors/AppError.js';
import { PasswordService } from '../../auth/services/PasswordService.js';
import { PhoneService } from '../../auth/services/PhoneService.js';
import { isValidUsername, normalizeUsername } from '../../auth/username.js';

export type BootstrapSuperAdminInput = {
  telephone: string;
  motDePasse: string;
  nom?: string;
  email?: string;
  username?: string;
  departement?: string;
};

export type BootstrapSuperAdminResult = {
  userId: string;
  adminProfileId: string;
  telephone: string;
  nom: string;
  email: string | null;
  username: string | null;
  departement: string;
};

/**
 * Création du premier SUPER_ADMIN (idempotent).
 *
 * Règles de sécurité :
 * - le mot de passe vient d'une source externe (CLI / variable d'environnement),
 *   jamais codé en dur, jamais retourné par cette méthode ;
 * - le hash est produit par le PasswordService officiel du projet (scrypt) ;
 * - refuse de s'exécuter si un SUPER_ADMIN actif existe déjà (aucune
 *   duplication possible) ;
 * - toute la création est atomique (transaction Prisma).
 */
export class BootstrapSuperAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordService: PasswordService = new PasswordService(),
    private readonly phoneService: PhoneService = new PhoneService()
  ) {}

  async execute(input: BootstrapSuperAdminInput): Promise<BootstrapSuperAdminResult> {
    if (!input.telephone || !input.motDePasse) {
      throw new ConflictError('Téléphone et mot de passe sont obligatoires');
    }

    const existingSuperAdmin = await this.prisma.user.count({
      where: {
        role: 'ADMIN',
        statut: 'ACTIF',
        adminProfile: { is: { niveauAcces: 'SUPER_ADMIN' } },
      },
    });
    if (existingSuperAdmin > 0) {
      throw new ConflictError(
        'Un (ou plusieurs) compte SUPER_ADMIN actif existe déjà. Le bootstrap ne s’exécute qu’une seule fois.'
      );
    }

    const telephone = this.phoneService.normalize(input.telephone);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const nom = input.nom?.trim() ?? '';
    const departement = input.departement?.trim() ?? '';
    const username = input.username ? normalizeUsername(input.username) : null;

    if (username) {
      if (!isValidUsername(username)) {
        throw new ValidationError(
          'Username invalide : 3-30 caractères (a-z, 0-9, point, tiret, underscore), en minuscules, sans espace, et sans séparateur en début ou fin.'
        );
      }
      const existingUsername = await this.prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        throw new ConflictError('Un compte existe déjà avec ce nom d’utilisateur.');
      }
    }

    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new ConflictError('Un compte existe déjà avec cette adresse e-mail.');
      }
    }

    const existingPhone = await this.prisma.user.findUnique({ where: { telephone } });
    if (existingPhone) {
      throw new ConflictError('Un compte existe déjà avec ce numéro de téléphone.');
    }

    const motDePasseHash = await this.passwordService.hash(input.motDePasse);

    const { userId, adminProfileId } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            telephone,
            email,
            nom,
            username,
            motDePasse: motDePasseHash,
            role: 'ADMIN',
            statut: 'ACTIF',
            telephoneVerificationStatus: 'VERIFIE',
            telephoneVerifiedAt: new Date(),
          },
        });

        const adminProfile = await tx.adminProfile.create({
          data: {
            userId: user.id,
            niveauAcces: 'SUPER_ADMIN',
            departement,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            action: 'CREATE_ADMIN',
            actorAdminId: null,
            targetAdminId: adminProfile.id,
            details: { viaBootstrap: true, superAdmin: true },
          },
        });

        return { userId: user.id, adminProfileId: adminProfile.id };
      }
    );

    return {
      userId,
      adminProfileId,
      telephone,
      nom,
      email,
      username,
      departement,
    };
  }
}
