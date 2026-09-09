import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CSV_EXPORT_LIMIT, UserService } from '../../src/modules/users/users.service';
import { UserRepository } from '../../src/modules/users/users.repository';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/AppError';

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
const ACTOR_SUPPORT = {
  id: '123e4567-e89b-12d3-a456-426614174003',
  role: 'ADMIN',
  adminAccessLevel: 'SUPPORT',
};
const TARGET_ID = '123e4567-e89b-12d3-a456-426614174010';

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: TARGET_ID,
  email: 'cible@example.com',
  nom: 'Cible',
  telephone: '+22890123456',
  motDePasse: 'hash',
  statut: 'ACTIF',
  role: 'ACHETEUR',
  telephoneVerificationStatus: 'VERIFIE',
  telephoneVerifiedAt: new Date(),
  anonymizedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  artisanProfile: null,
  buyerProfile: { id: '123e4567-e89b-12d3-a456-426614174020', typeClient: 'PARTICULIER' },
  adminProfile: null,
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
    ...overrides,
  } as unknown as UserRepository;
  const service = new UserService(repository);
  return { service, repository };
}

describe('UserService - RBAC & anti-escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list / getById / export (SUPPORT minimum)', () => {
    it('authorise le liste pour SUPPORT', async () => {
      const { service, repository } = buildService();
      repository.listUsers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
      await expect(service.listUsers(ACTOR_SUPPORT, { page: 1, limit: 20 })).resolves.toBeDefined();
    });

    it('refuse le liste pour un non-ADMIN', async () => {
      const { service } = buildService();
      await expect(
        service.listUsers({ id: 'x', role: 'ACHETEUR' }, { page: 1, limit: 20 })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('retourne 404 si l’utilisateur n’existe pas (détail)', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(ACTOR_SUPPORT, TARGET_ID)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('retourne l’utilisateur avec ses profils (détail)', async () => {
      const { service, repository } = buildService();
      const user = makeUser({ adminProfile: { id: 'a', niveauAcces: 'SUPPORT' } });
      repository.findById.mockResolvedValue(user);
      const result = await service.getById(ACTOR_SUPPORT, TARGET_ID);
      expect(result).toEqual(user);
    });
  });

  describe('createUser', () => {
    const baseInput = {
      role: 'ACHETEUR' as const,
      telephone: '+22890123456',
      motDePasse: 'S3cretPass!',
      nom: 'Awa',
    };

    it('créé un ACHETEUR (MODERATEUR minimum)', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue(null);
      repository.createUser.mockResolvedValue(makeUser());
      await service.createUser(ACTOR_MODERATEUR, baseInput);
      expect(repository.createUser).toHaveBeenCalled();
    });

    it('refuse la création pour SUPPORT (il est en lecture seule)', async () => {
      const { service, repository } = buildService();
      await expect(service.createUser(ACTOR_SUPPORT, baseInput)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('interdit la création d’un ADMIN par un MODERATEUR', async () => {
      const { service, repository } = buildService();
      await expect(
        service.createUser(ACTOR_MODERATEUR, {
          ...baseInput,
          role: 'ADMIN',
          niveauAcces: 'SUPPORT',
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.createUser).not.toHaveBeenCalled();
    });

    it('autorise la création d’un ADMIN par SUPER_ADMIN', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue(null);
      repository.createUser.mockResolvedValue(
        makeUser({ role: 'ADMIN', adminProfile: { id: 'a', niveauAcces: 'SUPPORT' } })
      );
      await expect(
        service.createUser(ACTOR_SUPER, {
          ...baseInput,
          role: 'ADMIN',
          niveauAcces: 'SUPPORT',
        })
      ).resolves.toBeDefined();
    });

    it('signale un conflit téléphone existant', async () => {
      const { service, repository } = buildService();
      repository.findByTelephone.mockResolvedValue(makeUser());
      await expect(service.createUser(ACTOR_MODERATEUR, baseInput)).rejects.toThrow(
        'existe déjà'
      );
    });
  });

  describe('updateStatut', () => {
    it('autorise le changement pour MODERATEUR', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(makeUser());
      repository.updateStatut.mockResolvedValue(makeUser({ statut: 'SUSPENDU' }));
      await service.updateStatut(ACTOR_MODERATEUR, TARGET_ID, { statut: 'SUSPENDU' });
      expect(repository.updateStatut).toHaveBeenCalledWith(TARGET_ID, 'SUSPENDU');
    });

    it('refuse pour SUPPORT', async () => {
      const { service, repository } = buildService();
      await expect(
        service.updateStatut(ACTOR_SUPPORT, TARGET_ID, { statut: 'SUSPENDU' })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.updateStatut).not.toHaveBeenCalled();
    });

    it('interdit l’auto-modification de son propre statut', async () => {
      const { service, repository } = buildService();
      await expect(
        service.updateStatut(ACTOR_MODERATEUR, ACTOR_MODERATEUR.id, { statut: 'SUSPENDU' })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.updateStatut).not.toHaveBeenCalled();
    });

    it('retourne 404 si l’utilisateur cible n’existe pas', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(
        service.updateStatut(ACTOR_MODERATEUR, TARGET_ID, { statut: 'SUSPENDU' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateRole', () => {
    const roleInput = { role: 'ADMIN' as const, niveauAcces: 'SUPPORT' as const };

    it('requiert SUPER_ADMIN', async () => {
      const { service, repository } = buildService();
      await expect(service.updateRole(ACTOR_MODERATEUR, TARGET_ID, roleInput)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(service.updateRole(ACTOR_SUPPORT, TARGET_ID, roleInput)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      expect(repository.changeRole).not.toHaveBeenCalled();
    });

    it('interdit la modification de son propre rôle', async () => {
      const { service, repository } = buildService();
      await expect(
        service.updateRole(ACTOR_SUPER, ACTOR_SUPER.id, roleInput)
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.changeRole).not.toHaveBeenCalled();
    });

    it('crée un AdminProfile quand la cible devient ADMIN', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(makeUser());
      repository.changeRole.mockResolvedValue(
        makeUser({ role: 'ADMIN', adminProfile: { id: 'a', niveauAcces: 'SUPPORT' } })
      );
      const result = await service.updateRole(ACTOR_SUPER, TARGET_ID, roleInput);
      expect(repository.changeRole).toHaveBeenCalledWith(
        TARGET_ID,
        'ADMIN',
        'SUPPORT',
        false
      );
      expect(result.role).toBe('ADMIN');
      expect(result.adminProfile).toBeTruthy();
    });

    it('retourne adminProfile null quand la cible quitte le rôle ADMIN', async () => {
      const { service, repository } = buildService();
      const adminUser = makeUser({
        role: 'ADMIN',
        adminProfile: { id: 'a', niveauAcces: 'SUPPORT' },
      });
      repository.findById.mockResolvedValue(adminUser);
      repository.changeRole.mockResolvedValue(makeUser({ role: 'ACHETEUR', adminProfile: null }));
      const result = await service.updateRole(ACTOR_SUPER, TARGET_ID, {
        role: 'ACHETEUR',
      });
      expect(result.adminProfile).toBeNull();
    });

    it('retourne 404 si la cible n’existe pas', async () => {
      const { service, repository } = buildService();
      repository.findById.mockResolvedValue(null);
      await expect(service.updateRole(ACTOR_SUPER, TARGET_ID, roleInput)).rejects.toBeInstanceOf(
        NotFoundError
      );
      expect(repository.changeRole).not.toHaveBeenCalled();
    });
  });

  describe('enveloppe de liste & pagination', () => {
    it('calcule totalPages depuis total et limit', async () => {
      const { service, repository } = buildService();
      repository.listUsers.mockResolvedValue({ items: [], total: 20, page: 2, limit: 10 });
      const result = await service.listUsers(ACTOR_SUPPORT, { page: 2, limit: 10 });
      expect(result).toEqual({ items: [], total: 20, page: 2, limit: 10, totalPages: 2 });
    });

    it('renvoie totalPages = 0 quand total = 0', async () => {
      const { service, repository } = buildService();
      repository.listUsers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
      const result = await service.listUsers(ACTOR_SUPPORT, { page: 1, limit: 20 });
      expect(result.totalPages).toBe(0);
    });
  });

  describe('export CSV', () => {
    it('exporte via findForExport (filtres identiques, sans pagination client)', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([makeUser()]);
      const { csv } = await service.exportUsers(ACTOR_SUPPORT, { q: 'awa', bloques: true });
      expect(repository.findForExport).toHaveBeenCalledWith(
        { q: 'awa', bloques: true },
        CSV_EXPORT_LIMIT
      );
      expect(csv).toContain(
        'id,nom,email,telephone,role,statut,inscription,niveau_admin,profil'
      );
      expect(csv).toContain('ACHETEUR');
      expect(csv).toContain('+22890123456');
    });

    it('refuse l’export à un non-ADMIN', async () => {
      const { service, repository } = buildService();
      await expect(service.exportUsers({ id: 'x', role: 'ACHETEUR' }, {})).rejects.toBeInstanceOf(
        ForbiddenError
      );
      expect(repository.findForExport).not.toHaveBeenCalled();
    });

    it('échappe virgules et guillemets dans les cellules', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([
        makeUser({ nom: 'Mensah, "Awa"', email: 'a@b.c,suite' }),
      ]);
      const { csv } = await service.exportUsers(ACTOR_SUPPORT, {});
      expect(csv).toContain('"Mensah, ""Awa"""');
      expect(csv).toContain('"a@b.c,suite"');
    });
  });
});
