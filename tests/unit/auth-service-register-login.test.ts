import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpPurpose } from '../../src/generated/prisma/client.js';
import { AuthService } from '../../src/modules/auth/services/AuthService';
import { PhoneService } from '../../src/modules/auth/services/PhoneService';
import {
  ConflictError,
  ForbiddenError,
  LoginRateLimitedError,
  PhoneNotVerifiedError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/AppError';

const baseUser = {
  id: 'user-1',
  telephone: '+22890123456',
  email: null,
  nom: 'Awa Mensah',
  motDePasse: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  role: 'ACHETEUR',
  statut: 'ACTIF',
  telephoneVerificationStatus: 'VERIFIE',
  telephoneVerifiedAt: new Date(),
};

const artisanUser = {
  ...baseUser,
  id: 'user-2',
  role: 'ARTISAN',
};

function buildService(
  options: {
    findByPhone?: unknown;
    findByEmail?: unknown;
    findByUsername?: unknown;
    createUserWithCredentials?: unknown;
    isUniqueConstraintError?: (error: unknown) => boolean;
    passwordHash?: unknown;
    compare?: unknown;
    limiter?: unknown;
  } = {}
) {
  const repository = {
    findByPhone: options.findByPhone ?? vi.fn().mockResolvedValue(null),
    findByEmail: options.findByEmail ?? vi.fn().mockResolvedValue(null),
    findByUsername: options.findByUsername ?? vi.fn().mockResolvedValue(null),
    createUserWithCredentials:
      options.createUserWithCredentials ?? vi.fn().mockResolvedValue(baseUser),
    updatePhoneVerification: vi
      .fn()
      .mockResolvedValue({ ...baseUser, telephoneVerificationStatus: 'VERIFIE' }),
    isUniqueConstraintError: options.isUniqueConstraintError ?? (() => false),
    createUser: vi.fn().mockResolvedValue(baseUser),
    findById: vi.fn().mockResolvedValue(baseUser),
  };

  const otpService = {
    createOtp: vi
      .fn()
      .mockResolvedValue({ code: '123456', expiresAt: new Date(Date.now() + 300000) }),
    checkRateLimit: vi.fn().mockResolvedValue(undefined),
    verifyOtp: vi.fn().mockResolvedValue(undefined),
    resendOtp: vi.fn(),
    checkResendCooldown: vi.fn().mockResolvedValue(undefined),
  };

  const smsService = { sendOtp: vi.fn().mockResolvedValue(undefined) };
  const jwtService = { generateToken: vi.fn().mockReturnValue('jwt.token') };

  const passwordService = {
    hash: options.passwordHash ?? vi.fn().mockResolvedValue('hashed-password'),
    compare: options.compare ?? vi.fn().mockResolvedValue(true),
  };

  const limiter = options.limiter ?? {
    check: vi.fn(),
    recordFailure: vi.fn(),
    reset: vi.fn(),
  };

  const service = new AuthService(
    repository as any,
    otpService as any,
    new PhoneService(),
    smsService as any,
    jwtService as any,
    passwordService as any,
    limiter as any
  );

  return { service, repository, otpService, smsService, jwtService, passwordService, limiter };
}

const acheteurInput = {
  role: 'ACHETEUR' as const,
  nom: 'Awa Mensah',
  telephone: '+22890123456',
  motDePasse: 'S3cretPassword!',
};

const artisanInput = {
  role: 'ARTISAN' as const,
  nom: 'Atelier Kokou',
  telephone: '+22890123456',
  specialite: 'Sculpture',
  localisation: 'Lomé, Togo',
  motDePasse: 'S3cretPassword!',
};

describe('AuthService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an ACHETEUR account, hashes the password, and returns OTP details without a token', async () => {
    const { service, repository, passwordService, otpService, smsService } = buildService();

    const result = await service.register({
      ...acheteurInput,
      email: '  USER@Example.com  ',
    });

    expect(passwordService.hash).toHaveBeenCalledWith('S3cretPassword!');
    expect(repository.createUserWithCredentials).toHaveBeenCalledWith({
      telephone: '+22890123456',
      email: 'user@example.com',
      nom: 'Awa Mensah',
      motDePasseHash: 'hashed-password',
      role: 'ACHETEUR',
      artisanProfile: null,
      buyerProfile: {
        adresseLivraison: '',
      },
    });
    expect(repository.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(otpService.createOtp).toHaveBeenCalledWith({
      phone: '+22890123456',
      userId: null,
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });
    expect(smsService.sendOtp).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('expiresAt');
    expect(result).not.toHaveProperty('accessToken');
  });

  it('creates an ARTISAN account with its ArtisanProfile fields', async () => {
    const { service, repository } = buildService();

    await service.register(artisanInput);

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith({
      telephone: '+22890123456',
      email: null,
      nom: 'Atelier Kokou',
      motDePasseHash: 'hashed-password',
      role: 'ARTISAN',
      artisanProfile: {
        type: 'ARTISAN',
        nomAtelier: 'Atelier Kokou',
        specialite: 'Sculpture',
        localisation: 'Lomé, Togo',
        biographie: '',
        anneesExperience: 0,
      },
      buyerProfile: null,
    });
  });

  it('creates an ARTISAN profile with an explicit ARTISTE type', async () => {
    const { service, repository } = buildService();

    await service.register({ ...artisanInput, type: 'ARTISTE' as const });

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith({
      telephone: '+22890123456',
      email: null,
      nom: 'Atelier Kokou',
      motDePasseHash: 'hashed-password',
      role: 'ARTISAN',
      artisanProfile: {
        type: 'ARTISTE',
        nomAtelier: 'Atelier Kokou',
        specialite: 'Sculpture',
        localisation: 'Lomé, Togo',
        biographie: '',
        anneesExperience: 0,
      },
      buyerProfile: null,
    });
  });

  it('creates an ACHETEUR with a BuyerProfile so commands can be placed', async () => {
    const { service, repository } = buildService();

    await service.register(acheteurInput);

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ACHETEUR',
        buyerProfile: {
          adresseLivraison: '',
        },
      })
    );
  });

  it('passes no BuyerProfile for an ARTISAN', async () => {
    const { service, repository } = buildService();

    await service.register(artisanInput);

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ARTISAN',
        buyerProfile: null,
      })
    );
  });

  it('defaults to ARTISAN type when an ARTISAN registers without a type', async () => {
    const { service, repository } = buildService();

    await service.register(artisanInput);

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ARTISAN',
        artisanProfile: expect.objectContaining({ type: 'ARTISAN' }),
      })
    );
  });

  it('stores no email when none is provided', async () => {
    const { service, repository } = buildService();

    await service.register(acheteurInput);

    expect(repository.createUserWithCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ email: null })
    );
    expect(repository.findByEmail).not.toHaveBeenCalled();
  });

  it('throws ConflictError when the phone is already taken', async () => {
    const { service } = buildService({
      findByPhone: vi.fn().mockResolvedValue(baseUser),
    });

    await expect(service.register(acheteurInput)).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when the email is already taken', async () => {
    const { service } = buildService({
      findByEmail: vi.fn().mockResolvedValue(baseUser),
    });

    await expect(service.register({ ...acheteurInput, email: 'user@example.com' })).rejects.toThrow(
      ConflictError
    );
  });

  it('maps a unique constraint violation to ConflictError', async () => {
    const { service, repository } = buildService({
      createUserWithCredentials: vi.fn().mockRejectedValue(new Error('P2002')),
      isUniqueConstraintError: () => true,
    });

    await expect(service.register(acheteurInput)).rejects.toThrow(ConflictError);
    expect(repository.createUserWithCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ACHETEUR' })
    );
  });

  it('rejects any role other than ACHETEUR or ARTISAN', async () => {
    const { service, repository } = buildService();

    await expect(service.register({ ...acheteurInput, role: 'ADMIN' } as any)).rejects.toThrow(
      ValidationError
    );

    expect(repository.createUserWithCredentials).not.toHaveBeenCalled();
    expect(repository.findByPhone).not.toHaveBeenCalled();
  });
});

describe('AuthService.verifyPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the phone as VERIFIE and returns the updated user', async () => {
    const { service, repository, otpService, jwtService } = buildService({
      findByPhone: vi.fn().mockResolvedValue({
        ...baseUser,
        telephoneVerificationStatus: 'NON_VERIFIE',
        telephoneVerifiedAt: null,
      }),
    });

    const result = await service.verifyPhone('+22890123456', '123456');

    expect(otpService.verifyOtp).toHaveBeenCalledWith({
      phone: '+22890123456',
      code: '123456',
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });
    expect(repository.updatePhoneVerification).toHaveBeenCalled();
    expect(result.accessToken).toBe('jwt.token');
    expect(jwtService.generateToken).toHaveBeenCalledWith({ id: 'user-1', role: 'ACHETEUR' });
    expect(result.user.telephoneVerificationStatus).toBe('VERIFIE');
  });

  it('never auto-creates an account for an unknown phone', async () => {
    const { service, repository, jwtService } = buildService();

    await expect(service.verifyPhone('+22899999999', '123456')).rejects.toThrow(UnauthorizedError);

    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.updatePhoneVerification).not.toHaveBeenCalled();
    expect(jwtService.generateToken).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Bearer token and public user on valid credentials', async () => {
    const { service, repository, passwordService, jwtService, limiter } = buildService({
      findByPhone: vi.fn().mockResolvedValue(baseUser),
    });

    const result = await service.login({
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(repository.findByPhone).toHaveBeenCalledWith('+22890123456');
    expect(passwordService.compare).toHaveBeenCalledWith('S3cretPassword!', baseUser.motDePasse);
    expect(jwtService.generateToken).toHaveBeenCalledWith({ id: 'user-1', role: 'ACHETEUR' });
    expect(limiter.reset).toHaveBeenCalledWith('phone:+22890123456', 'unknown');
    expect(result).toHaveProperty('accessToken', 'jwt.token');
    expect(result).toHaveProperty('tokenType', 'Bearer');
    expect(result.user.role).toBe('ACHETEUR');
    expect(result.user).not.toHaveProperty('motDePasse');
    expect(result.user).not.toHaveProperty('email');
  });

  it('returns a Bearer token for an ARTISAN with phone + password', async () => {
    const { service, jwtService } = buildService({
      findByPhone: vi.fn().mockResolvedValue(artisanUser),
    });

    const result = await service.login({
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(jwtService.generateToken).toHaveBeenCalledWith({ id: 'user-2', role: 'ARTISAN' });
    expect(result.user.role).toBe('ARTISAN');
  });

  it('throws a generic UnauthorizedError and records the failure when the user is unknown', async () => {
    const { service, limiter } = buildService();

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' })
    ).rejects.toThrow(UnauthorizedError);

    expect(limiter.recordFailure).toHaveBeenCalledWith('phone:+22890123456', 'unknown');
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it('throws a generic UnauthorizedError and records the failure when the password is wrong', async () => {
    const { service, passwordService, limiter } = buildService({
      findByPhone: vi.fn().mockResolvedValue(baseUser),
      compare: vi.fn().mockResolvedValue(false),
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'wrong-password' })
    ).rejects.toThrow(UnauthorizedError);

    expect(passwordService.compare).toHaveBeenCalled();
    expect(limiter.recordFailure).toHaveBeenCalledWith('phone:+22890123456', 'unknown');
    expect(limiter.reset).not.toHaveBeenCalled();
  });

  it('suggests OTP-based authentication when the user has no stored password', async () => {
    const { service, limiter, jwtService } = buildService({
      findByPhone: vi.fn().mockResolvedValue({ ...baseUser, motDePasse: null }),
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' })
    ).rejects.toThrow(UnauthorizedError);

    expect(limiter.recordFailure).not.toHaveBeenCalled();
    expect(jwtService.generateToken).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDU', 'INACTIF'])('rejects a %s account as forbidden', async (statut) => {
    const { service } = buildService({
      findByPhone: vi.fn().mockResolvedValue({ ...baseUser, statut }),
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses to log into a space that does not match the account role', async () => {
    const { service, jwtService, limiter } = buildService({
      findByPhone: vi.fn().mockResolvedValue(artisanUser),
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!', role: 'ACHETEUR' })
    ).rejects.toThrow(ForbiddenError);

    expect(jwtService.generateToken).not.toHaveBeenCalled();
    expect(limiter.reset).not.toHaveBeenCalled();
  });

  it('allows login when the selected space matches the account role', async () => {
    const { service } = buildService({
      findByPhone: vi.fn().mockResolvedValue(artisanUser),
    });

    const result = await service.login({
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
      role: 'ARTISAN',
    });

    expect(result.user.role).toBe('ARTISAN');
  });

  it('does not issue a JWT for an unverified phone and signals the verification flow', async () => {
    const { service, jwtService, limiter } = buildService({
      findByPhone: vi.fn().mockResolvedValue({
        ...baseUser,
        telephoneVerificationStatus: 'NON_VERIFIE',
        telephoneVerifiedAt: null,
      }),
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' })
    ).rejects.toThrow(PhoneNotVerifiedError);

    expect(jwtService.generateToken).not.toHaveBeenCalled();
    expect(limiter.reset).not.toHaveBeenCalled();
  });

  it('propagates a rate-limit block', async () => {
    const { service } = buildService({
      findByPhone: vi.fn().mockResolvedValue(baseUser),
      limiter: {
        check: vi.fn().mockImplementation(() => {
          throw new LoginRateLimitedError();
        }),
        recordFailure: vi.fn(),
        reset: vi.fn(),
      },
    });

    await expect(
      service.login({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' })
    ).rejects.toThrow(LoginRateLimitedError);
  });

  it('logs in an ADMIN via a username identifier', async () => {
    const adminUser = {
      ...baseUser,
      id: 'admin-1',
      username: 'g.apedo',
      role: 'ADMIN',
      statut: 'ACTIF',
    };
    const { service, repository, jwtService, limiter } = buildService({
      findByUsername: vi.fn().mockResolvedValue(adminUser),
    });

    const result = await service.login({
      identifier: 'g.apedo',
      motDePasse: 'S3cretPassword!',
      role: 'ADMIN',
    });

    expect(repository.findByUsername).toHaveBeenCalledWith('g.apedo');
    expect(repository.findByPhone).not.toHaveBeenCalled();
    expect(jwtService.generateToken).toHaveBeenCalledWith({ id: 'admin-1', role: 'ADMIN' });
    expect(result.user.role).toBe('ADMIN');
    expect(limiter.reset).toHaveBeenCalledWith('username:g.apedo', 'unknown');
  });

  it('logs in via an email identifier (normalized to lowercase)', async () => {
    const { service, repository, limiter } = buildService({
      findByEmail: vi.fn().mockResolvedValue(baseUser),
    });

    const result = await service.login({
      identifier: '  AWA@Exemple.COM ',
      motDePasse: 'S3cretPassword!',
    });

    expect(repository.findByEmail).toHaveBeenCalledWith('awa@exemple.com');
    expect(repository.findByPhone).not.toHaveBeenCalled();
    expect(result.user.role).toBe('ACHETEUR');
    expect(limiter.reset).toHaveBeenCalledWith('email:awa@exemple.com', 'unknown');
  });

  it('resolves a phone-like identifier through the phone lookup', async () => {
    const { service, repository } = buildService({
      findByPhone: vi.fn().mockResolvedValue(baseUser),
    });

    await service.login({
      identifier: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(repository.findByPhone).toHaveBeenCalledWith('+22890123456');
    expect(repository.findByUsername).not.toHaveBeenCalled();
  });

  it('prefers identifier over the legacy telephone field when both are provided', async () => {
    const { service, repository } = buildService({
      findByUsername: vi.fn().mockResolvedValue(baseUser),
    });

    await service.login({
      telephone: '+22890123456',
      identifier: 'awa.mensah',
      motDePasse: 'S3cretPassword!',
    });

    expect(repository.findByUsername).toHaveBeenCalledWith('awa.mensah');
    expect(repository.findByPhone).not.toHaveBeenCalled();
  });
});
