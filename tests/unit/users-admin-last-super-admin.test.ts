import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '../../src/modules/users/users.service';
import { UserRepository } from '../../src/modules/users/users.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/AppError';

const ACTOR_SUPER = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  role: 'ADMIN',
  adminAccessLevel: 'SUPER_ADMIN',
};
const ACTOR_MODERATEUR = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  role: 'ADMIN',
  adminAccessLevel: 'MODERATEUR',
};
const TARGET_ID = '123e4567-e89b-12d3-a456-426614174010';

const superAdminUser = (overrides: Record<string, unknown> = {}) => ({
  id: TARGET_ID,
  email: 'sup@example.com',
  nom: 'Grand Admin',
  telephone: '+22890987654',
  motDePasse: 'hash',
  statut: 'ACTIF',
  role: 'ADMIN',
  telephoneVerificationStatus: 'VERIFIE',
  telephoneVerifiedAt: new Date(),
  anonymizedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  artisanProfile: null,
  buyerProfile: null,
  adminProfile: { id: 'p-sup', niveauAcces: 'SUPER_ADMIN', departement: 'Dir' },
  ...overrides,
});

function buildService(overrides: Partial<UserRepository> = {}) {
  const repository = {
    findById: vi.fn(),
    findByTelephone: vi.fn(),
    findByEmail: vi.fn(),
    isUniqueConstraintError: vi.fn(),
    createUser: vi.fn(),
    updateStatut: vi.fn(),
    updateRole: vi.fn(),
    changeRole: vi.fn(),
    listUsers: vi.fn(),
    exportUsers: vi.fn(),
    findForExport: vi.fn(),
    countActiveSuperAdmins: vi.fn(),
    updateStatutWithSuperAdminGuard: vi.fn(),
    changeRoleWithSuperAdminGuard: vi.fn(),
    ...overrides,
  } as unknown as UserRepository;
  const service = new UserService(repository);
  return { service, repository };
}

describe('UserService - protection du dernier SUPER_ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateStatut', () => {
    it('bloque la désactivation du dernier SUPER_ADMIN (erreur renvoyée par la garde)', async () => {
      const { service, repository } = buildService();
      repository.updateStatutWithSuperAdminGuard.mockRejectedValue(
        new ConflictError('Impossible de désactiver le dernier SUPER_ADMIN')
      );

      await expect(
        service.updateStatut(ACTOR_MODERATEUR, TARGET_ID, { statut: 'INACTIF' })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repository.updateStatutWithSuperAdminGuard).toHaveBeenCalledWith(TARGET_ID, 'INACTIF');
    });

    it('autorise la désactivation quand un autre SUPER_ADMIN reste actif', async () => {
      const { service, repository } = buildService();
      repository.updateStatutWithSuperAdminGuard.mockResolvedValue(1);
      repository.findById.mockResolvedValue(superAdminUser({ statut: 'INACTIF' }));

      const result = await service.updateStatut(ACTOR_MODERATEUR, TARGET_ID, { statut: 'INACTIF' });
      expect(repository.updateStatutWithSuperAdminGuard).toHaveBeenCalledWith(TARGET_ID, 'INACTIF');
      expect(result.statut).toBe('INACTIF');
    });

    it('retourne 404 si la cible n’existe pas', async () => {
      const { service, repository } = buildService();
      repository.updateStatutWithSuperAdminGuard.mockResolvedValue(0);

      await expect(
        service.updateStatut(ACTOR_MODERATEUR, TARGET_ID, { statut: 'SUSPENDU' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('interdit un administrateur de modifier son propre statut', async () => {
      const { service } = buildService();
      await expect(
        service.updateStatut(ACTOR_MODERATEUR, ACTOR_MODERATEUR.id, { statut: 'INACTIF' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('updateRole', () => {
    it('bloque la révocation du rôle du dernier SUPER_ADMIN actif', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminUser());
      repository.changeRoleWithSuperAdminGuard.mockRejectedValue(
        new ConflictError('Impossible de révoquer le statut du dernier SUPER_ADMIN')
      );

      await expect(
        service.updateRole(ACTOR_SUPER, TARGET_ID, { role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repository.changeRoleWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_ID,
        'ACHETEUR',
        undefined,
        true
      );
    });

    it('bloque la rétrogradation du dernier SUPER_ADMIN actif', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminUser());
      repository.changeRoleWithSuperAdminGuard.mockRejectedValue(
        new ConflictError('Impossible de révoquer le statut du dernier SUPER_ADMIN')
      );

      await expect(
        service.updateRole(ACTOR_SUPER, TARGET_ID, { role: 'ADMIN', niveauAcces: 'SUPPORT' })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repository.changeRoleWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_ID,
        'ADMIN',
        'SUPPORT',
        true
      );
    });

    it('autorise la révocation s’il reste un autre SUPER_ADMIN actif', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminUser());
      repository.changeRoleWithSuperAdminGuard.mockResolvedValue({
        user: { id: TARGET_ID, role: 'ACHETEUR' },
        adminProfile: null,
      });

      const result = await service.updateRole(ACTOR_SUPER, TARGET_ID, { role: 'ACHETEUR' });
      expect(repository.changeRoleWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_ID,
        'ACHETEUR',
        undefined,
        true
      );
      expect(result.adminProfile).toBeNull();
    });

    it('retourne l’adminProfile pour un changement vers ADMIN', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminUser({ adminProfile: null }));
      repository.changeRoleWithSuperAdminGuard.mockResolvedValue({
        user: { id: TARGET_ID, role: 'ADMIN' },
        adminProfile: { id: 'p-sup', niveauAcces: 'MODERATEUR' },
      });

      const result = await service.updateRole(ACTOR_SUPER, TARGET_ID, {
        role: 'ADMIN',
        niveauAcces: 'MODERATEUR',
      });
      expect(repository.changeRoleWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_ID,
        'ADMIN',
        'MODERATEUR',
        false
      );
      expect(result.adminProfile).toEqual({ id: 'p-sup', niveauAcces: 'MODERATEUR' });
    });

    it('interdit un SUPER_ADMIN de modifier son propre rôle', async () => {
      const { service } = buildService();
      await expect(
        service.updateRole(ACTOR_SUPER, ACTOR_SUPER.id, { role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
