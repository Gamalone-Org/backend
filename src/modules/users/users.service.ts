import { AdminAccessLevel } from '../../generated/prisma/client.js';
import {
  UserRepository,
  type ExportUsersOptions,
  type ListUsersOptions,
} from './users.repository.js';
import { PasswordService } from '../auth/services/PasswordService.js';
import { PhoneService } from '../auth/services/PhoneService.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/AppError.js';
import { hasMinAdminAccessLevel } from '../../config/kyc.js';
import type {
  CreateUserInput,
  UpdateUserRoleInput,
  UpdateUserStatutInput,
} from './users.schema.js';

export const CSV_EXPORT_LIMIT = 5000;

export type Actor = {
  id: string;
  role: string;
  adminAccessLevel?: AdminAccessLevel | null;
};

export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly passwordService: PasswordService = new PasswordService(),
    private readonly phoneService: PhoneService = new PhoneService()
  ) {}

  async listUsers(actor: Actor, options: ListUsersOptions) {
    this.assertSupportOrAbove(actor);
    const { items, total, page, limit } = await this.repository.listUsers(options);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { items, total, page, limit, totalPages };
  }

  async getById(actor: Actor, id: string) {
    this.assertSupportOrAbove(actor);
    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundError('Utilisateur non trouvé');
    }
    return user;
  }

  async createUser(actor: Actor, input: CreateUserInput) {
    this.assertModeratorOrAbove(actor);

    const telephone = this.phoneService.normalize(input.telephone);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const nom = input.nom?.trim() || null;

    if (input.role === 'ADMIN' && !this.isSuperAdmin(actor)) {
      throw new ForbiddenError('Seul un SUPER_ADMIN peut créer un compte ADMIN');
    }

    if ((input.niveauAcces as string | undefined) === 'SUPER_ADMIN') {
      throw new ForbiddenError(
        "La création d'un compte SUPER_ADMIN via l'API est interdite. Utilisez le bootstrap dédié ou une promotion via mise à jour de rôle."
      );
    }

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
      return await this.repository.createUser({
        telephone,
        email,
        nom,
        motDePasseHash,
        role: input.role,
        statut: input.statut,
        niveauAcces: input.niveauAcces,
        artisanProfile: input.artisanProfile ?? null,
        buyerProfile: input.buyerProfile ?? null,
      });
    } catch (error) {
      if (this.repository.isUniqueConstraintError(error)) {
        throw new ConflictError('Un compte avec ce téléphone ou cet e-mail existe déjà');
      }
      throw error;
    }
  }

  async updateStatut(actor: Actor, id: string, input: UpdateUserStatutInput) {
    this.assertModeratorOrAbove(actor);

    if (id === actor.id) {
      throw new ForbiddenError('Un administrateur ne peut pas modifier son propre statut');
    }

    const result = await this.repository.updateStatutWithSuperAdminGuard(id, input.statut);
    if (result === 0) {
      throw new NotFoundError('Utilisateur non trouvé');
    }

    const user = await this.repository.findById(id);
    if (!user) {
      throw new NotFoundError('Utilisateur non trouvé');
    }
    return user;
  }

  async updateRole(actor: Actor, id: string, input: UpdateUserRoleInput) {
    this.assertSuperAdmin(actor);

    if (id === actor.id) {
      throw new ForbiddenError('Un administrateur ne peut pas modifier son propre rôle');
    }

    const target = await this.repository.findById(id);
    if (!target) {
      throw new NotFoundError('Utilisateur non trouvé');
    }

    const targetRole = input.role;
    const currentAdminProfileExists = Boolean(target.adminProfile);

    const updated = await this.repository.changeRoleWithSuperAdminGuard(
      id,
      targetRole,
      input.niveauAcces,
      currentAdminProfileExists
    );

    return {
      ...target,
      role: updated.user.role,
      adminProfile: targetRole === 'ADMIN' ? updated.adminProfile : null,
    };
  }

  async exportUsers(actor: Actor, options: ExportUsersOptions): Promise<{ csv: string }> {
    this.assertSupportOrAbove(actor);
    return this.exportInternal(options);
  }

  private async exportInternal(options: ExportUsersOptions): Promise<{ csv: string }> {
    const items = await this.repository.findForExport(options, CSV_EXPORT_LIMIT);

    const headers = [
      'id',
      'nom',
      'email',
      'telephone',
      'role',
      'statut',
      'inscription',
      'niveau_admin',
      'profil',
    ];

    const escape = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = items.map((user) =>
      [
        user.id,
        escape(user.nom ?? ''),
        escape(user.email ?? ''),
        escape(user.telephone),
        user.role,
        user.statut,
        user.createdAt.toISOString(),
        escape(user.adminProfile?.niveauAcces ?? ''),
        user.role === 'ARTISAN'
          ? escape(user.artisanProfile?.nomAtelier ?? '')
          : user.role === 'ACHETEUR'
            ? escape(user.buyerProfile?.typeClient ?? '')
            : '',
      ].join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    return { csv };
  }

  private assertSupportOrAbove(actor: Actor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Accès administrateur requis');
    }
  }

  private assertModeratorOrAbove(actor: Actor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Accès administrateur requis');
    }
    if (!hasMinAdminAccessLevel(actor.adminAccessLevel, 'MODERATEUR')) {
      throw new ForbiddenError('Niveau MODERATEUR requis');
    }
  }

  private assertSuperAdmin(actor: Actor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Accès administrateur requis');
    }
    if (!hasMinAdminAccessLevel(actor.adminAccessLevel, 'SUPER_ADMIN')) {
      throw new ForbiddenError('Niveau SUPER_ADMIN requis');
    }
  }

  private isSuperAdmin(actor: Actor): boolean {
    return actor.role === 'ADMIN' && hasMinAdminAccessLevel(actor.adminAccessLevel, 'SUPER_ADMIN');
  }
}
