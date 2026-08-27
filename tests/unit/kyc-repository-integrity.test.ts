import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KycRepository } from '../../src/modules/kyc/kyc.repository.js';

const input = {
  identityData: { firstName: 'Awa' },
  addressData: { city: 'Lome' },
  identityDocument: { type: 'CNI' },
};

function createTransactionMock() {
  const tx = {
    kyc: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    artisanProfile: {
      update: vi.fn(),
    },
    adminProfile: {
      findUnique: vi.fn(),
    },
    kycReviewHistory: {
      create: vi.fn(),
    },
  };

  return tx;
}

describe('KycRepository integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates KYC submissions without altering resubmission defaults', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
    const repository = new KycRepository({ kyc: { create } } as any);

    await repository.createSubmission('user-1', input);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user: { connect: { id: 'user-1' } },
        status: 'SOUMIS',
        submittedAt: expect.any(Date),
      }),
    });
  });

  it('creates resubmissions linked to the previous KYC record', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'kyc-2',
      status: 'SOUMIS',
      resubmissionOfId: 'kyc-1',
    });
    const repository = new KycRepository({ kyc: { create } } as any);

    await repository.createResubmission('user-1', 'kyc-1', input);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user: { connect: { id: 'user-1' } },
        previousSubmission: { connect: { id: 'kyc-1' } },
        status: 'SOUMIS',
      }),
    });
  });

  it('persists immutable admin snapshots when approving a KYC', async () => {
    const tx = createTransactionMock();
    tx.kyc.findUnique.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'SOUMIS',
      user: { statut: 'ACTIF', artisanProfile: null },
    });
    tx.kyc.update.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });
    tx.adminProfile.findUnique.mockResolvedValue({
      id: 'admin-profile-1',
      departement: 'Compliance',
      niveauAcces: 'MODERATEUR',
    });
    tx.kycReviewHistory.create.mockResolvedValue({ id: 'history-1' });

    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new KycRepository(prisma as any);

    await repository.approveSubmission('kyc-1', 'admin-profile-1');

    expect(tx.kycReviewHistory.create).toHaveBeenCalledWith({
      data: {
        kycId: 'kyc-1',
        adminId: 'admin-profile-1',
        adminProfileIdSnapshot: 'admin-profile-1',
        adminDepartementSnapshot: 'Compliance',
        adminNiveauAccesSnapshot: 'MODERATEUR',
        action: 'APPROUVER',
        reason: null,
      },
    });
  });

  it('persists immutable admin snapshots when rejecting a KYC', async () => {
    const tx = createTransactionMock();
    tx.kyc.findUnique.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'SOUMIS',
    });
    tx.kyc.update.mockResolvedValue({ id: 'kyc-1', status: 'REJETE' });
    tx.adminProfile.findUnique.mockResolvedValue({
      id: 'admin-profile-1',
      departement: 'Compliance',
      niveauAcces: 'SUPER_ADMIN',
    });
    tx.kycReviewHistory.create.mockResolvedValue({ id: 'history-1' });

    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new KycRepository(prisma as any);

    await repository.rejectSubmission('kyc-1', 'admin-profile-1', 'Invalid document');

    expect(tx.kycReviewHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminProfileIdSnapshot: 'admin-profile-1',
        adminDepartementSnapshot: 'Compliance',
        adminNiveauAccesSnapshot: 'SUPER_ADMIN',
        action: 'REJETER',
        reason: 'Invalid document',
      }),
    });
  });

  it('does not silently drop review history when admin profile lookup fails', async () => {
    const tx = createTransactionMock();
    tx.kyc.findUnique.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'SOUMIS',
      user: { statut: 'ACTIF', artisanProfile: null },
    });
    tx.kyc.update.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });
    tx.adminProfile.findUnique.mockResolvedValue(null);

    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new KycRepository(prisma as any);

    await expect(repository.approveSubmission('kyc-1', 'missing-admin')).rejects.toThrow(
      'Admin profile not found: missing-admin'
    );
    expect(tx.kycReviewHistory.create).not.toHaveBeenCalled();
  });
});
