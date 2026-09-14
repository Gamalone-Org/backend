import { type AdminAuditAction } from '../../../generated/prisma/client.js';
import { hasMinAdminAccessLevel } from '../../../config/kyc.js';
import { isAdminManagementPermission } from '../../../config/admin-permissions.js';
import { PasswordService } from '../../auth/services/PasswordService.js';
import { PhoneService } from '../../auth/services/PhoneService.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../common/errors/AppError.js';
import { AdministrateurRepository } from './administrateurs.repository.js';
import type { Actor, AuditDetails } from './administrateurs.types.js';
import type {
  CreateAdministrateurInput,
  ListAdministrateursQuery,
  UpdateAdministrateurInput,
  UpdateAdministrateurPermissionsInput,
  UpdateAdministrateurStatutInput,
} from './administrateurs.schema.js';

export class AdministrateurService {
  constructor(
    private readonly repository: AdministrateurRepository,
    private readonly passwordService: PasswordService = new PasswordService(),
    private readonly phoneService: PhoneService = new PhoneService()
  ) {}

  async list(actor: Actor, options: ListAdministrateursQuery) {
    this.assertSuperAdmin(actor);
    const { items, total, page, limit } = await this.repository.list({
      page: options.page,
      limit: options.limit,
      q: options.q,
      statut: options.statut,
      niveauAcces: options.niveauAcces,
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { items, total, page, limit, totalPages };
  }

  async getById(actor: Actor, adminProfileId: string) {
    this.assertSuperAdmin(actor);
    const admin = await this.repository.findById(adminProfileId);
    if (!admin) {
      throw new NotFoundError('Administrateur non trouvé');
    }
    return admin;
  }

  async create(actor: Actor, input: CreateAdministrateurInput) {
    this.assertSuperAdmin(actor);

    // Les permissions ADMINS_* ne peuvent jamais être attribuées à un compte
    // qui n'est pas SUPER_ADMIN direct (défense en profondeur, en plus des
    // règles du schéma Zod et du middleware requirePermission).
    if (input.permissions.some((permission) => isAdminManagementPermission(permission))) {
      throw new ForbiddenError('Les permissions ADMINS_* sont réservées au SUPER_ADMIN direct');
    }

    const telephone = this.phoneService.normalize(input.telephone);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const nom = input.nom.trim();

    const existingByPhone = await this.repository.findByTelephone(telephone);
    if (existingByPhone) {
      throw new ConflictError('Un compte avec ce numéro de téléphone existe déjà');
    }

    if (email) {
      const existingByEmail = await this.repository.findByEmail(email);
      if (existingByEmail) {
        throw new ConflictError('Un compte avec cette adresse e-mail existe déjà');
      }
    }

    const motDePasseHash = await this.passwordService.hash(input.motDePasse);

    try {
      const { adminProfileId } = await this.repository.createAdministrateur({
        telephone,
        email,
        nom,
        motDePasseHash,
        niveauAcces: input.niveauAcces,
        departement: input.departement ?? '',
        permissions: input.permissions,
      });

      await this.logAudit(actor, 'CREATE_ADMIN', adminProfileId, {
        telephone,
        niveauAcces: input.niveauAcces,
        permissions: input.permissions,
      });

      const created = await this.repository.findById(adminProfileId);
      if (!created) {
        throw new NotFoundError('Administrateur non trouvé');
      }
      return created;
    } catch (error) {
      if (this.repository.isUniqueConstraintError(error)) {
        throw new ConflictError('Un compte avec ce téléphone ou cet e-mail existe déjà');
      }
      throw error;
    }
  }

  async update(actor: Actor, adminProfileId: string, input: UpdateAdministrateurInput) {
    this.assertSuperAdmin(actor);
    await this.assertNotSelf(actor, adminProfileId);

    const target = await this.repository.findById(adminProfileId);
    if (!target) {
      throw new NotFoundError('Administrateur non trouvé');
    }

    const email = input.email === null ? null : input.email?.trim().toLowerCase();

    if (email) {
      const existingByEmail = await this.repository.findByEmail(email);
      if (existingByEmail && existingByEmail.id !== target.id) {
        throw new ConflictError('Un compte avec cette adresse e-mail existe déjà');
      }
    }

    await this.repository.updateAdministrateur(adminProfileId, {
      nom: input.nom,
      email,
      departement: input.departement,
    });

    await this.logAudit(actor, 'UPDATE_ADMIN', adminProfileId, {
      nom: input.nom,
      email,
      departement: input.departement,
    });

    return this.requireDetail(adminProfileId);
  }

  async updatePermissions(
    actor: Actor,
    adminProfileId: string,
    input: UpdateAdministrateurPermissionsInput
  ) {
    this.assertSuperAdmin(actor);
    await this.assertNotSelf(actor, adminProfileId);

    const target = await this.repository.findById(adminProfileId);
    if (!target) {
      throw new NotFoundError('Administrateur non trouvé');
    }

    if (input.permissions.some((permission) => isAdminManagementPermission(permission))) {
      throw new ForbiddenError('Les permissions ADMINS_* sont réservées au SUPER_ADMIN direct');
    }

    // Un SUPER_ADMIN ne porte jamais de permissions en base : rien à modifier.
    if (target.adminProfile?.niveauAcces !== 'SUPER_ADMIN') {
      await this.repository.setPermissions(adminProfileId, input.permissions);
    }

    await this.logAudit(actor, 'UPDATE_ADMIN_PERMISSIONS', adminProfileId, {
      permissions: input.permissions,
    });

    return this.requireDetail(adminProfileId);
  }

  async updateStatut(actor: Actor, adminProfileId: string, input: UpdateAdministrateurStatutInput) {
    this.assertSuperAdmin(actor);
    await this.assertNotSelf(actor, adminProfileId);

    const updated = await this.repository.updateStatutWithSuperAdminGuard(
      adminProfileId,
      input.statut
    );
    if (updated === 0) {
      throw new NotFoundError('Administrateur non trouvé');
    }

    await this.logAudit(
      actor,
      input.statut === 'ACTIF' ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN',
      adminProfileId,
      { statut: input.statut }
    );

    return this.requireDetail(adminProfileId);
  }

  private assertSuperAdmin(actor: Actor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Accès administrateur requis');
    }
    if (!hasMinAdminAccessLevel(actor.adminAccessLevel, 'SUPER_ADMIN')) {
      throw new ForbiddenError('Niveau SUPER_ADMIN requis');
    }
  }

  private async assertNotSelf(actor: Actor, adminProfileId: string): Promise<void> {
    if (actor.adminProfileId && actor.adminProfileId === adminProfileId) {
      throw new ForbiddenError('Un SUPER_ADMIN ne peut pas modifier son propre compte');
    }
  }

  private async logAudit(
    actor: Actor,
    action: AdminAuditAction,
    targetAdminId: string,
    details: AuditDetails
  ): Promise<void> {
    await this.repository.logAudit(action, actor.adminProfileId ?? null, targetAdminId, details);
  }

  private async requireDetail(adminProfileId: string) {
    const admin = await this.repository.findById(adminProfileId);
    if (!admin) {
      throw new NotFoundError('Administrateur non trouvé');
    }
    return admin;
  }
}

export type { Actor } from './administrateurs.types.js';
