import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OeuvreRepository } from '../../src/modules/marketplace/oeuvre.repository.js';

function createMockPrisma() {
  return {
    kyc: {
      findFirst: vi.fn(),
    },
  } as any;
}

function makeKyc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'kyc-1',
    userId: 'user-1',
    status: 'VALIDE',
    deletedAt: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('OeuvreRepository.findKycValidForUser', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repo: OeuvreRepository;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new OeuvreRepository(mockPrisma);
  });

  it('queries the latest non-deleted KYC and confirms it is VALIDE', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(makeKyc({ id: 'kyc-1' }));

    const result = await repo.findKycValidForUser('user-1');

    expect(mockPrisma.kyc.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result?.id).toBe('kyc-1');
  });

  it('scenario: single VALIDE KYC -> artisan is valid', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-1', status: 'VALIDE', createdAt: new Date('2025-01-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result?.id).toBe('kyc-1');
  });

  it('scenario: no KYC record -> artisan is invalid', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(null);

    const result = await repo.findKycValidForUser('user-1');
    expect(result).toBeNull();
  });

  it('scenario: latest KYC is VALIDE -> artisan is valid', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-2', status: 'VALIDE', createdAt: new Date('2025-03-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result?.id).toBe('kyc-2');
  });

  it('scenario: older VALIDE + latest SOUMIS -> artisan is invalid (latest takes precedence)', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-2', status: 'SOUMIS', createdAt: new Date('2025-03-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result).toBeNull();
  });

  it('scenario: older VALIDE + latest REJETE -> artisan is invalid (latest takes precedence)', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-2', status: 'REJETE', createdAt: new Date('2025-03-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result).toBeNull();
  });

  it('scenario: multiple KYC -> deterministic selection by createdAt DESC then id DESC', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-2', status: 'VALIDE', createdAt: new Date('2025-03-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result?.id).toBe('kyc-2');
    expect(mockPrisma.kyc.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('scenario: latest KYC is soft-deleted -> ignored, next non-deleted is evaluated', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-1', status: 'VALIDE', createdAt: new Date('2025-01-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result?.id).toBe('kyc-1');

    const where = mockPrisma.kyc.findFirst.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
  });

  it('scenario: latest non-deleted KYC is REJETE even if an older VALIDE exists -> invalid', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(
      makeKyc({ id: 'kyc-2', status: 'REJETE', createdAt: new Date('2025-03-01') })
    );

    const result = await repo.findKycValidForUser('user-1');
    expect(result).toBeNull();
  });

  it('scenario: only VALIDE KYC is soft-deleted and none non-deleted remain -> invalid', async () => {
    mockPrisma.kyc.findFirst.mockResolvedValue(null);

    const result = await repo.findKycValidForUser('user-1');
    expect(result).toBeNull();
  });
});
