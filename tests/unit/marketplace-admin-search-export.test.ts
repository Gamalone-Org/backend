import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreRepository } from '../../src/modules/marketplace/oeuvre.repository.js';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service.js';

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

describe('OeuvreRepository.findAllAdmin search (q)', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repo: OeuvreRepository;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new OeuvreRepository(mockPrisma);
  });

  it('adds a titre/description contains OR clause when q is provided', async () => {
    mockPrisma.oeuvre.findMany.mockResolvedValue([]);
    mockPrisma.oeuvre.count.mockResolvedValue(0);

    await repo.findAllAdmin(1, 20, { q: 'sculpture' }, select);

    const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
    expect(findArgs.where.OR).toEqual([
      { titre: { contains: 'sculpture', mode: 'insensitive' } },
      { description: { contains: 'sculpture', mode: 'insensitive' } },
    ]);
    const countArgs = mockPrisma.oeuvre.count.mock.calls[0][0];
    expect(countArgs.where.OR).toEqual(findArgs.where.OR);
  });

  it('combines q with the existing admin filters (statut, disponibilite)', async () => {
    mockPrisma.oeuvre.findMany.mockResolvedValue([]);
    mockPrisma.oeuvre.count.mockResolvedValue(0);

    await repo.findAllAdmin(
      1,
      20,
      { q: 'sculpture', statut: 'PUBLIEE', disponibilite: 'SUR_COMMANDE' },
      select
    );

    const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
    expect(findArgs.where.statut).toBe('PUBLIEE');
    expect(findArgs.where.disponibilite).toBe('SUR_COMMANDE');
    expect(findArgs.where.OR).toBeDefined();
  });

  it('does not add an OR clause when q is absent', async () => {
    mockPrisma.oeuvre.findMany.mockResolvedValue([]);
    mockPrisma.oeuvre.count.mockResolvedValue(0);

    await repo.findAllAdmin(1, 20, { statut: 'PUBLIEE' }, select);

    const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual({ statut: 'PUBLIEE' });
  });

  it('filters at the database level (skip/take) and returns rows untouched', async () => {
    const rows = [{ id: 'o1' }, { id: 'o2' }];
    mockPrisma.oeuvre.findMany.mockResolvedValue(rows);
    mockPrisma.oeuvre.count.mockResolvedValue(42);

    const result = await repo.findAllAdmin(2, 10, { q: 'x' }, select);

    const findArgs = mockPrisma.oeuvre.findMany.mock.calls[0][0];
    expect(findArgs.skip).toBe(10);
    expect(findArgs.take).toBe(10);
    expect(result.oeuvres).toEqual(rows);
    expect(result.total).toBe(42);
  });
});

describe('OeuvreService admin search & CSV export', () => {
  function buildService(overrides = {}) {
    const repository = {
      findAllAdmin: vi.fn(),
      ...overrides,
    } as any;
    return { service: new OeuvreService(repository), repository };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes q through to the repository within the admin filters', async () => {
    const { service, repository } = buildService();
    repository.findAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });

    await service.getAllAdmin(1, 20, { statut: 'PUBLIEE', q: 'bronze' }, select);

    expect(repository.findAllAdmin).toHaveBeenCalledWith(
      1,
      20,
      { statut: 'PUBLIEE', q: 'bronze' },
      select
    );
  });

  it('exports the full filtered set through a single repository query (no N+1)', async () => {
    const { service, repository } = buildService();
    repository.findAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });

    await service.exportCsv({ statut: 'PUBLIEE', q: 'sculpture', disponibilite: 'DISPONIBLE' }, select);

    expect(repository.findAllAdmin).toHaveBeenCalledTimes(1);
    expect(repository.findAllAdmin).toHaveBeenCalledWith(
      1,
      5000,
      { statut: 'PUBLIEE', q: 'sculpture', disponibilite: 'DISPONIBLE' },
      select
    );
  });

  it('builds a CSV with the expected columns and escaped values', async () => {
    const fakeOeuvre = {
      id: 'oeuvre-1',
      titre: 'Sculpture "Evolution", bois',
      artisan: {
        id: 'a-1',
        nomAtelier: 'Atelier Awa',
        user: { id: 'u-1', nom: 'Awa Mensah' },
      },
      categorie: { id: 'c-1', nom: 'Sculptures' },
      technique: 'Main',
      anneeCreation: 2023,
      prixXOF: '50000',
      statut: 'BROUILLON',
      disponibilite: 'DISPONIBLE',
      estMiseEnAvant: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const { service, repository } = buildService();
    repository.findAllAdmin.mockResolvedValue({ oeuvres: [fakeOeuvre], total: 1 });

    const csv = await service.exportCsv({}, select);
    const lines = csv.split('\n');

    expect(lines[0]).toBe(
      'identifiant,titre,artisan,categorie,technique,anneeCreation,prixXOF,statut,disponibilite,estMiseEnAvant,createdAt'
    );
    expect(lines[1]).toBe(
      'oeuvre-1,"Sculpture ""Evolution"", bois",Awa Mensah,Sculptures,Main,2023,50000,BROUILLON,DISPONIBLE,true,2024-01-01T00:00:00.000Z'
    );
  });

  it('falls back to nomAtelier when the linked user has no nom', async () => {
    const fakeOeuvre = {
      id: 'oeuvre-2',
      titre: 'Vase',
      artisan: { id: 'a-2', nomAtelier: 'Atelier Kossi', user: { id: 'u-2', nom: '' } },
      categorie: { id: 'c-2', nom: 'Céramique' },
      technique: 'Tour',
      anneeCreation: 2022,
      prixXOF: '12000',
      statut: 'PUBLIEE',
      disponibilite: 'EN_EXPOSITION',
      estMiseEnAvant: false,
      createdAt: new Date('2023-05-05T00:00:00.000Z'),
    };
    const { service, repository } = buildService();
    repository.findAllAdmin.mockResolvedValue({ oeuvres: [fakeOeuvre], total: 1 });

    const csv = await service.exportCsv({}, select);
    const row = csv.split('\n')[1];

    expect(row).toContain(',Atelier Kossi,Céramique,');
  });
});