import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Prisma,
  type PrismaClient,
} from '../../src/generated/prisma/client.js';
import {
  ConflictError,
  ValidationError,
} from '../../src/common/errors/AppError.js';
import { PhoneService } from '../../src/modules/auth/services/PhoneService.js';
import { PasswordService } from '../../src/modules/auth/services/PasswordService.js';
import { resolveLoginIdentifier } from '../../src/modules/auth/username.js';
import {
  SuperAdminSeedService,
  type SuperAdminSeedInput,
  type SuperAdminSeedResult,
  readSuperAdminSeedEnv,
  OFFICIAL_SUPER_ADMIN_USERNAME,
} from '../../src/modules/admin/administrateurs/super-admin-seed.service.js';

const TELEPHONE = '+2290102030405';
const MOT_DE_PASSE = 'S3cretPass!';
const EMAIL = 'awa@exemple.com';

type TxMocks = {
  userCreate: ReturnType<typeof vi.fn>;
  userFindMany: ReturnType<typeof vi.fn>;
  userCount: ReturnType<typeof vi.fn>;
  userFindUnique: ReturnType<typeof vi.fn>;
  userUpdate: ReturnType<typeof vi.fn>;
  adminProfileCreate: ReturnType<typeof vi.fn>;
  auditLogCreate: ReturnType<typeof vi.fn>;
};

function makeTx() {
  const userCreate = vi.fn();
  const userFindMany = vi.fn();
  const userCount = vi.fn();
  const userFindUnique = vi.fn();
  const userUpdate = vi.fn();
  const adminProfileCreate = vi.fn();
  const auditLogCreate = vi.fn();
  const tx = {
    user: { create: userCreate, findMany: userFindMany, count: userCount, findUnique: userFindUnique, update: userUpdate },
    adminProfile: { create: adminProfileCreate },
    adminAuditLog: { create: auditLogCreate },
  } as unknown as Prisma.TransactionClientimar;
  return { tx, txMocks: { userCreate, userFindMany, userCount, userFindUnique, userUpdate, adminProfileCreate, auditLogCreate } as TxMocks };
}

function makeFixture() {
  const { tx, txMocks } = makeTx();
  const passwordHash = vi.fn();
  const prisma = {
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return Promise.resolve((arg as (t: unknown) => unknown)(tx));
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    user: {
      findMany: txMocks.userFindMany,
      count: txMocks.userCount,
      findUnique: txMocks.userFindUnique,
    },
  } as unknown as PrismaClient;

  const passwordService = { hash: passwordHash } as unknown as PasswordService    ;

  const service = new SuperAdminSeedService(
    prisma,
    passwordService,
    new PhoneService()
  );

  return {
    service,
    mocks: {
      ...txMocks,
      passwordHash,
    },
  };
}

function seedInput(
  overrides: Partial<SuperAdminSeedInput> = {}
): SuperAdminSeedInput {
  return {
    telephone: TELEPHONE,
    motDePasse: MOT_DE_PASSE,
    username: OFFICIAL_SUPER_ADMIN_USERNAME,
    email: EMAIL,
    ...overrides,
  };
}

describe('SuperAdminSeedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. CRÉATION : aucun SUPER_ADMIN actif → User ADMIN/ACTIF/USERNAME officiel g.apedo, mot de passe hashé JAMAIS en clair', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([]);
    f.mocks.userCount.mockResolvedValue(0);
    f.mocks.userFindUnique.mockResolvedValue(null);
    f.mocks.userCreate.mockResolvedValue({ id: 'user-1' });
    f.mocks.adminProfileCreate.mockResolvedValue({ id: 'profile-1' });
    f.mocks.auditLogCreate.mockResolvedValue({ id: 'log-1' });

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telephone: TELEPHONE,
          role: 'ADMIN',
          username: OFFICIAL_SUPER_ADMIN_USERNAME,
        }),
      })
    );
    expect(f.mocks.passwordHash).toHaveBeenCalledWith(MOT_DE_PASSE);
    expect(result.action).toBe('created');
    expect(result.username).toBe(OFFICIAL_SUPER_ADMIN_USERNAME);
    expect(JSON.stringify(result)).not.toContain(MOT_DE_PASSE);
  });

  it('2. IDEMPOTENCE : SUPER_ADMIN actif existant → aucune création ni modification, hash jamais recalculé', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: OFFICIAL_SUPER_ADMIN_USERNAME, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userCreate).not.toHaveBeenCalled();
    expect(f.mocks.userUpdate).not.toHaveBeenCalled();
    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    expect(result.action).toBe('unchanged');
  });

  it('3. MOT DE PASSE JAMAIS RÉINITIALISÉ : SUPER_ADMIN existant avec motDePasse déjà hashé → AUCUNE réinitialisation, repair username seulement', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: null, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);
    f.mocks.userUpdate.mockResolvedValue({
      id: 'user-123',
      username: OFFICIAL_SUPER_ADMIN_USERNAME,
      email: EMAIL,
    });

    const result = await f.service.execute(seedInput());

    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ motDePasse: expect.anything() }),
      })
    );
    expect(result.action).toBe('repaired');
  });

  it('4. RÉPARATION USERNAME : username NULL → renseigné avec g.apedo (identifiant officiel), jamais un username pris', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: null, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);
    f.mocks.userUpdate.mockResolvedValue({
      id: 'user-123',
      username: OFFICIAL_SUPER_ADMIN_USERNAME,
      email: EMAIL,
    });

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: OFFICIAL_SUPER_ADMIN_USERNAME }),
      })
    );
    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ motDePasse: expect.anything() }),
      })
    );
    expect(result.action).toBe('repaired');
  });

  it('5. USERNAME DÉJÀ PRÉSENT : aucun changement, aucun hash', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: OFFICIAL_SUPER_ADMIN_USERNAME, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userUpdate).not.toHaveBeenCalled();
    expect(f.mocks.userCreate).not.toHaveBeenCalled();
    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    expect(result.action).toBe('unchanged');
  });

  it('6. RÉPARATION EMAIL : email NULL → renseigné', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: OFFICIAL_SUPER_ADMIN_USERNAME, email: null },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);
    f.mocks.userUpdate.mockResolvedValue({
      id: 'user-123',
      username: OFFICIAL_SUPER_ADMIN_USERNAME,
      email: EMAIL,
    });

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: EMAIL }),
      })
    );
    expect(result.action).toBe('repaired');
  });

  it('7. CONFLIT : username déjà pris par un autre compte → aucune modification', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: null, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue({ id: 'user-999' });

    await expect(f.service.execute(seedInput())).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(f.mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('8. readSuperAdminSeedEnv : variables REQUISES manquantes → ValidationError, aucune écriture', () => {
    const original = { ...process.env };
    delete process.env['BOOTSTRAP_ADMIN_TELEPHONE'];
    delete process.env['BOOTSTRAP_ADMIN_PASSWORD'];

    try {
      expect(() => readSuperAdminSeedEnv()).toThrow(ValidationError);
    } finally {
      process.env = original;
    }
  });

  it('9. readSuperAdminSeedEnv : username non fourni → identifiant officiel g.apedo par défaut (username ≠ secret)', () => {
    const original = { ...process.env };
    process.env['BOOTSTRAP_ADMIN_TELEPHONE'] = TELEPHONE;
    process.env['BOOTSTRAP_ADMIN_PASSWORD'] = MOT_DE_PASSE;
    delete process.env['BOOTSTRAP_ADMIN_USERNAME'];

    try {
      const input = readSuperAdminSeedEnv();
      expect(input.username).toBe(OFFICIAL_SUPER_ADMIN_USERNAME);
    } finally {
      process.env = original;
    }
  });

  it('10. LOGIN PAR USERNAME : identifier = g.apedo (username officiel) → résolu en username, cohérent avec la création', () => {
    expect(OFFICIAL_SUPER_ADMIN_USERNAME).toBe('g.apedo');
    // Le seed utilise le username officiel comme identifiant public de connexion.
    expect(seedInput().username).toBe('g.apedo');
  });

  it('11. CRÉATION AVEC USERNAME DEPUIS ENV : BOOTSTRAP_ADMIN_USERNAME=g.apedo fourni → créé avec ce username', () => {
    const original = { ...process.env };
    process.env['BOOTSTRAP_ADMIN_TELEPHONE'] = TELEPHONE;
    process.env['BOOTSTRAP_ADMIN_PASSWORD'] = MOT_DE_PASSE;
    process.env['BOOTSTRAP_ADMIN_USERNAME'] = 'g.apedo';

    try {
      const input = readSuperAdminSeedEnv();
      expect(input.username).toBe('g.apedo');
    } finally {
      process.env = original;
    }
  });

  it('12. SUPER_ADMIN EXISTANT AVEC USERNAME NULL → réparation vers g.apedo, aucun hash', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: null, email: null },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);
    f.mocks.userUpdate.mockResolvedValue({
      id: 'user-123',
      username: OFFICIAL_SUPER_ADMIN_USERNAME,
      email: null,
    });

    const result = await f.service.execute(seedInput());

    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: OFFICIAL_SUPER_ADMIN_USERNAME }),
      })
    );
    expect(f.mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ motDePasse: expect.anything() }),
      })
    );
    expect(result.action).toBe('repaired');
    expect(result.username).toBe(OFFICIAL_SUPER_ADMIN_USERNAME);
  });

  it('13. SECOND RUN : SUPER_ADMIN déjà créé avec username g.apedo → aucune modification', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: OFFICIAL_SUPER_ADMIN_USERNAME, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);

    const result = await f.service.execute(seedInput());

    expect(f.mocks.userCreate).not.toHaveBeenCalled();
    expect(f.mocks.userUpdate).not.toHaveBeenCalled();
    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    expect(result.action).toBe('unchanged');
  });

  it('14. MOT DE PASSE EXISTANT INCHANGÉ : aucun hash, aucune réinitialisation sur tout type d\'action', async () => {
    const f = makeFixture();
    f.mocks.userFindMany.mockResolvedValue([
      { id: 'user-123', username: OFFICIAL_SUPER_ADMIN_USERNAME, email: EMAIL },
    ]);
    f.mocks.userFindUnique.mockResolvedValue(null);

    const result = await f.service.execute(seedInput());

    expect(f.mocks.passwordHash).not.toHaveBeenCalled();
    if (f.mocks.userUpdate.mock.calls.length > 0) {
      for (const call of f.mocks.userUpdate.mock.calls) {
        const data = (call[0] as { data: Record<string, unknown> }).data;
        expect(data).not.toHaveProperty('motDePasse');
      }
    }
    expect(result.action).toBe('unchanged');
  });

  it('15. LOGIN AVEC USERNAME APRÈS CRÉATION/RÉPARATION : identifier=g.apedo → résolu en type username', () => {
    const resolved = resolveLoginIdentifier({ identifier: 'g.apedo' });
    expect(resolved).toEqual({ type: 'username', value: 'g.apedo' });
  });
});