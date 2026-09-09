import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OeuvreRepository } from '../../src/modules/marketplace/oeuvre.repository.js';

function createMockPrisma() {
  return {
    oeuvre: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  } as any;
}

const select = {} as any;

describe('OeuvreRepository disponibilite', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repo: OeuvreRepository;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new OeuvreRepository(mockPrisma);
  });

  describe('create', () => {
    const baseData = {
      titre: 'T',
      description: 'D',
      technique: 'T',
      materiaux: 'M',
      dimensions: 'D',
      anneeCreation: 2023,
      prixXOF: 100,
      artisanId: 'artisan-1',
      categorieId: 'cat-1',
    };

    it('defaults disponibilite to DISPONIBLE when omitted', async () => {
      mockPrisma.oeuvre.create.mockResolvedValue({ id: 'oeuvre-1' });

      await repo.create(baseData);

      const createArgs = mockPrisma.oeuvre.create.mock.calls[0][0];
      expect(createArgs.data.disponibilite).toBe('DISPONIBLE');
    });

    it('forwards SUR_COMMANDE', async () => {
      mockPrisma.oeuvre.create.mockResolvedValue({ id: 'oeuvre-1' });

      await repo.create({ ...baseData, disponibilite: 'SUR_COMMANDE' });

      const createArgs = mockPrisma.oeuvre.create.mock.calls[0][0];
      expect(createArgs.data.disponibilite).toBe('SUR_COMMANDE');
    });

    it('forwards EN_EXPOSITION', async () => {
      mockPrisma.oeuvre.create.mockResolvedValue({ id: 'oeuvre-1' });

      await repo.create({ ...baseData, disponibilite: 'EN_EXPOSITION' });

      const createArgs = mockPrisma.oeuvre.create.mock.calls[0][0];
      expect(createArgs.data.disponibilite).toBe('EN_EXPOSITION');
    });
  });

  describe('update', () => {
    it('forwards a disponibilite change', async () => {
      mockPrisma.oeuvre.update.mockResolvedValue({ id: 'oeuvre-1', disponibilite: 'SUR_COMMANDE' });

      await repo.update('oeuvre-1', { disponibilite: 'SUR_COMMANDE' });

      expect(mockPrisma.oeuvre.update).toHaveBeenCalledWith({
        where: { id: 'oeuvre-1' },
        data: { disponibilite: 'SUR_COMMANDE' },
      });
    });
  });

  describe('findAllAdmin', () => {
    it('filters by disponibilite when provided', async () => {
      mockPrisma.oeuvre.findMany.mockResolvedValue([]);
      mockPrisma.oeuvre.count.mockResolvedValue(0);

      await repo.findAllAdmin(1, 20, { disponibilite: 'EN_EXPOSITION' }, select);

      const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
      expect(findArgs.where.disponibilite).toBe('EN_EXPOSITION');
      const countArgs = mockPrisma.oeuvre.count.mock.calls[0][0];
      expect(countArgs.where.disponibilite).toBe('EN_EXPOSITION');
    });

    it('does not add disponibilite to the where clause when absent', async () => {
      mockPrisma.oeuvre.findMany.mockResolvedValue([]);
      mockPrisma.oeuvre.count.mockResolvedValue(0);

      await repo.findAllAdmin(1, 20, { statut: 'PUBLIEE' }, select);

      const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({ statut: 'PUBLIEE' });
    });
  });

  describe('findPublishedPublic', () => {
    it('filters by disponibilite when provided', async () => {
      mockPrisma.oeuvre.findMany.mockResolvedValue([]);
      mockPrisma.oeuvre.count.mockResolvedValue(0);

      await repo.findPublishedPublic(1, 20, { disponibilite: 'SUR_COMMANDE' }, select);

      const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
      expect(findArgs.where.statut).toBe('PUBLIEE');
      expect(findArgs.where.disponibilite).toBe('SUR_COMMANDE');
    });

    it('does not add disponibilite to the where clause when absent', async () => {
      mockPrisma.oeuvre.findMany.mockResolvedValue([]);
      mockPrisma.oeuvre.count.mockResolvedValue(0);

      await repo.findPublishedPublic(1, 20, {}, select);

      const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({ statut: 'PUBLIEE' });
    });
  });
});