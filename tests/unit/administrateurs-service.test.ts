import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdministrateurService } from '../../src/modules/admin/administrateurs/administrateurs.service';
import { AdministrateurRepository } from '../../src/modules/admin/administrateurs/administrateurs.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/AppError';

const ACTOR_SUPER = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  role: 'ADMIN' as const,
  adminAccessLevel: 'SUPER_ADMIN' as const,
  adminProfileId: 'p-super-a',
};
const ACTOR_SUPER_B = {
  id: '123e4567-e89b-12d3-a456-426614174005',
  role: 'ADMIN' as const,
  adminAccessLevel: 'SUPER_ADMIN' as const,
  adminProfileId: 'p-super-b',
};
const ACTOR_MODERATEUR = {
  id: '123e4567-e89b-12d3-a456-426614174002',
  role: 'ADMIN' as const,
  adminAccessLevel: 'MODERATEUR' as const,
  adminProfileId: 'p-mod',
};
const TARGET_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174010';

const adminDetail = (overrides: Record<string, unknown> = {}) => ({
  id: 'u-cible',
  email: 'cible@example.com',
  nom: 'Cible',
  telephone: '+22890123456',
  statut: 'ACTIF',
  role: 'ADMIN',
  createdAt: new Date(),
  updatedAt: new Date(),
  telephoneVerificationStatus: 'VERIFIE',
  telephoneVerifiedAt: new Date(),
  adminProfile: {
    id: TARGET_PROFILE_ID,
    niveauAcces: 'MODERATEUR',
    departement: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [{ permission: 'ORDERS_READ' }],
  },
  ...overrides,
});

const superAdminDetail = () =>
  adminDetail({
    adminProfile: {
      id: TARGET_PROFILE_ID,
      niveauAcces: 'SUPER_ADMIN',
      departement: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: [],
    },
  });

function buildService(overrides: Partial<AdministrateurRepository> = {}) {
  const repository = {
    list: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findByTelephone: vi.fn(),
    findByEmail: vi.fn(),
    isUniqueConstraintError: vi.fn(),
    createAdministrateur: vi.fn(),
    updateAdministrateur: vi.fn(),
    setPermissions: vi.fn(),
    updateStatut: vi.fn(),
    updateStatutWithSuperAdminGuard: vi.fn(),
    countActiveByNiveauAcces: vi.fn(),
    logAudit: vi.fn(),
    ...overrides,
  } as unknown as AdministrateurRepository;
  const service = new AdministrateurService(repository);
  return { service, repository };
}

describe('AdministrateurService - RBAC & anti-escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list / getById - réservé SUPER_ADMIN', () => {
    it('liste pour SUPER_ADMIN avec enveloppe paginée', async () => {
      const { service, repository } = buildService();
      repository.list.mockResolvedValue({ items: [], total: 20, page: 2, limit: 10 });
      const result = await service.list(ACTOR_SUPER, { page: 2, limit: 10 });
      expect(result).toEqual({ items: [], total: 20, page: 2, limit: 10, totalPages: 2 });
    });

    it('refuse la liste à un MODERATEUR (ADMIN simple sans permission ADMINS_*)', async () => {
      const { service } = buildService();
      await expect(service.list(ACTOR_MODERATEUR, { page: 1, limit: 20 })).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('retourne 404 au détail inexistant', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(ACTOR_SUPER, TARGET_PROFILE_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('create', () => {
    const baseInput = {
      nom: 'Nouvelle Admin',
      telephone: '+22890987654',
      motDePasse: 'S3cretPass!',
      niveauAcces: 'MODERATEUR' as const,
      permissions: ['ORDERS_READ'] as const,
    };

    it('refuse à un ADMIN simple', async () => {
      const { service } = buildService();
      await expect(service.create(ACTOR_MODERATEUR, baseInput as never)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('refuse les permissions ADMINS_* (anti-escalade, défense en profondeur)', async () => {
      const { service, repository } = buildService();
      await expect(
        service.create(ACTOR_SUPER, {
          ...baseInput,
          permissions: ['ADMINS_READ'],
        } as never)
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.createAdministrateur).not.toHaveBeenCalled();
    });

    it('refuse une création avec téléphone déjà utilisé', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue({ id: 'autre' });
      await expect(service.create(ACTOR_SUPER, baseInput as never)).rejects.toThrow('existe déjà');
    });

    it('refuse une création avec e-mail déjà utilisé', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue(null);
      repository.findByEmail.mockResolvedValue({ id: 'autre' });
      await expect(
        service.create(ACTOR_SUPER, { ...baseInput, email: 'a@b.c' } as never)
      ).rejects.toThrow('existe déjà');
    });

    it('crée le compte ADMIN + profil + permissions, puis trace l’audit', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue(null);
      repository.createAdministrateur.mockResolvedValue({
        userId: 'u-cible',
        adminProfileId: TARGET_PROFILE_ID,
      });
      repository.findById.mockResolvedValue(adminDetail());

      const result = await service.create(ACTOR_SUPER, baseInput as never);

      expect(repository.createAdministrateur).toHaveBeenCalledWith(
        expect.objectContaining({
          telephone: '+22890987654',
          email: null,
          nom: 'Nouvelle Admin',
          niveauAcces: 'MODERATEUR',
          permissions: ['ORDERS_READ'],
        })
      );
      expect(repository.logAudit).toHaveBeenCalledWith(
        'CREATE_ADMIN',
        'p-super-a',
        TARGET_PROFILE_ID,
        expect.objectContaining({ niveauAcces: 'MODERATEUR' })
      );
      expect(result.adminProfile).toBeTruthy();
    });
  });

  describe('update', () => {
    it('interdit l’auto-modification de son propre compte', async () => {
      const { service } = buildService();
      await expect(service.update(ACTOR_SUPER, 'p-super-a', { nom: 'X' })).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('retourne 404 si la cible n’existe pas', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(
        service.update(ACTOR_SUPER_B, TARGET_PROFILE_ID, { nom: 'X' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('refuse un e-mail déjà porté par un autre compte', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(adminDetail());
      repository.findByEmail.mockResolvedValue({ id: 'autre-user' });
      await expect(
        service.update(ACTOR_SUPER_B, TARGET_PROFILE_ID, { email: 'prise@a.c' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('met à jour et trace l’audit', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(adminDetail());
      repository.updateAdministrateur.mockResolvedValue(undefined);
      const result = await service.update(ACTOR_SUPER_B, TARGET_PROFILE_ID, {
        nom: 'Nouveau Nom',
        departement: 'Tech',
      });
      expect(repository.logAudit).toHaveBeenCalledWith(
        'UPDATE_ADMIN',
        'p-super-b',
        TARGET_PROFILE_ID,
        expect.objectContaining({ nom: 'Nouveau Nom', departement: 'Tech' })
      );
      expect(result).toBeTruthy();
    });
  });

  describe('updatePermissions', () => {
    it('interdit l’auto-modification', async () => {
      const { service } = buildService();
      await expect(
        service.updatePermissions(ACTOR_SUPER, 'p-super-a', { permissions: [] })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('refuse les permissions ADMINS_*', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(adminDetail());
      await expect(
        service.updatePermissions(ACTOR_SUPER_B, TARGET_PROFILE_ID, {
          permissions: ['ADMINS_UPDATE'],
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.setPermissions).not.toHaveBeenCalled();
    });

    it('attribue les permissions à un ADMIN', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(adminDetail());
      repository.setPermissions.mockResolvedValue(undefined);
      await service.updatePermissions(ACTOR_SUPER_B, TARGET_PROFILE_ID, {
        permissions: ['ORDERS_READ', 'ORDERS_UPDATE'],
      });
      expect(repository.setPermissions).toHaveBeenCalledWith(TARGET_PROFILE_ID, [
        'ORDERS_READ',
        'ORDERS_UPDATE',
      ]);
      expect(repository.logAudit).toHaveBeenCalledWith(
        'UPDATE_ADMIN_PERMISSIONS',
        'p-super-b',
        TARGET_PROFILE_ID,
        expect.objectContaining({ permissions: ['ORDERS_READ', 'ORDERS_UPDATE'] })
      );
    });

    it('ne modifie rien pour une cible SUPER_ADMIN (accès implicite)', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminDetail());
      await service.updatePermissions(ACTOR_SUPER_B, TARGET_PROFILE_ID, {
        permissions: ['ORDSDERS_READ' as never],
      });
      expect(repository.setPermissions).not.toHaveBeenCalled();
    });
  });

  describe('updateStatut', () => {
    it('interdit l’auto-modification', async () => {
      const { service } = buildService();
      await expect(
        service.updateStatut(ACTOR_SUPER, 'p-super-a', { statut: 'INACTIF' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('retourne 404 si la cible n’existe pas', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(
        service.updateStatut(ACTOR_SUPER_B, TARGET_PROFILE_ID, { statut: 'SUSPENDU' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('bloque la désactivation du dernier SUPER_ADMIN actif', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminDetail());
      repository.updateStatutWithSuperAdminGuard.mockRejectedValue(
        new ConflictError('Impossible de désactiver le dernier SUPER_ADMIN')
      );
      await expect(
        service.updateStatut(ACTOR_SUPER_B, TARGET_PROFILE_ID, { statut: 'INACTIF' })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repository.updateStatutWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_PROFILE_ID,
        'INACTIF'
      );
    });

    it('autorise la désactivation quand un autre SUPER_ADMIN reste actif', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(superAdminDetail({ statut: 'SUSPENDU' }));
      repository.updateStatutWithSuperAdminGuard.mockResolvedValue(1);
      await service.updateStatut(ACTOR_SUPER_B, TARGET_PROFILE_ID, { statut: 'INACTIF' });
      expect(repository.updateStatutWithSuperAdminGuard).toHaveBeenCalledWith(
        TARGET_PROFILE_ID,
        'INACTIF'
      );
      expect(repository.logAudit).toHaveBeenCalledWith(
        'DEACTIVATE_ADMIN',
        'p-super-b',
        TARGET_PROFILE_ID,
        expect.objectContaining({ statut: 'INACTIF' })
      );
    });

    it('trace ACTIVATE_ADMIN quand le statut redevient ACTIF', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(adminDetail({ statut: 'INACTIF' }));
      repository.updateStatutWithSuperAdminGuard.mockResolvedValue(1);
      await service.updateStatut(ACTOR_SUPER_B, TARGET_PROFILE_ID, { statut: 'ACTIF' });
      expect(repository.logAudit).toHaveBeenCalledWith(
        'ACTIVATE_ADMIN',
        'p-super-b',
        TARGET_PROFILE_ID,
        expect.objectContaining({ statut: 'ACTIF' })
      );
    });
  });
});
