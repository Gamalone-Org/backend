import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/common/errors/AppError.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

const input = {
  identityData: { firstName: 'Awa' },
  addressData: { city: 'Lome' },
  identityDocument: { type: 'CNI', reference: 'doc-1' },
};

function createRepository() {
  return {
    findUserPhoneVerification: vi.fn(),
    findActiveByUserId: vi.fn(),
    findLatestByUserId: vi.fn(),
    findById: vi.fn(),
    createSubmission: vi.fn(),
  };
}

describe('KycService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects submission when the phone is not verified', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({ telephoneVerificationStatus: 'NON_VERIFIE' });
    const service = new KycService(repository as any);

    await expect(service.submit('user-1', input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.createSubmission).not.toHaveBeenCalled();
  });

  it('creates a submitted KYC for a verified user', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({ telephoneVerificationStatus: 'VERIFIE' });
    repository.findActiveByUserId.mockResolvedValue(null);
    repository.createSubmission.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
    const service = new KycService(repository as any);

    await expect(service.submit('user-1', input)).resolves.toEqual({ id: 'kyc-1', status: 'SOUMIS' });
    expect(repository.createSubmission).toHaveBeenCalledWith('user-1', input);
  });

  it('rejects submission when an active KYC already exists', async () => {
    const repository = createRepository();
    repository.findUserPhoneVerification.mockResolvedValue({ telephoneVerificationStatus: 'VERIFIE' });
    repository.findActiveByUserId.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
    const service = new KycService(repository as any);

    await expect(service.submit('user-1', input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('does not allow access to another user KYC', async () => {
    const repository = createRepository();
    repository.findById.mockResolvedValue({ id: 'kyc-1', userId: 'user-2', status: 'SOUMIS' });
    const service = new KycService(repository as any);

    await expect(service.getById('kyc-1', { id: 'user-1', role: 'ACHETEUR' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows admins to access another user KYC', async () => {
    const repository = createRepository();
    const kyc = { id: 'kyc-1', userId: 'user-2', status: 'SOUMIS' };
    repository.findById.mockResolvedValue(kyc);
    const service = new KycService(repository as any);

    await expect(service.getById('kyc-1', { id: 'admin-1', role: 'ADMIN' })).resolves.toBe(kyc);
  });

  it('rejects the BROUILLON to VALIDE transition', () => {
    const service = new KycService(createRepository() as any);

    expect(() => service.validateStatusTransition('BROUILLON', 'VALIDE')).toThrow(ValidationError);
  });

  it('rejects every transition from a valid KYC', () => {
    const service = new KycService(createRepository() as any);

    expect(() => service.validateStatusTransition('VALIDE', 'SOUMIS')).toThrow(ValidationError);
  });
});
