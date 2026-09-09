import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/common/errors/AppError.js';
import { CSV_EXPORT_LIMIT, DisputeService } from '../../src/modules/disputes/dispute.service.js';

function createRepository() {
  return {
    findAllForAdmin: vi.fn(),
    findByIdForAdmin: vi.fn(),
    findForExport: vi.fn(),
  };
}

function buildService(repository = createRepository()) {
  const service = new DisputeService(repository as any);
  return { service, repository };
}

const LITIGE_ID = '123e4567-e89b-12d3-a456-426614174200';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174201';

describe('DisputeService.listAllAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcule totalPages = ceil(total / limit)', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ disputes: [], total: 42 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result).toEqual({ items: [], total: 42, page: 1, limit: 20, totalPages: 3 });
  });

  it('total = 0 → totalPages = 0', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ disputes: [], total: 0 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result.totalPages).toBe(0);
  });

  it('délègue les filtres au repository', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ disputes: [], total: 0 });

    await service.listAllAdmin(2, 10, {
      q: 'conforme',
      statut: 'OUVERT',
      commandeId: CMD_ID,
      clientId: 'user-1',
      artisanId: 'art-1',
      dateDebut: new Date('2026-01-01T00:00:00.000Z'),
      dateFin: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(repository.findAllForAdmin).toHaveBeenCalledWith(2, 10, {
      q: 'conforme',
      statut: 'OUVERT',
      commandeId: CMD_ID,
      clientId: 'user-1',
      artisanId: 'art-1',
      dateDebut: new Date('2026-01-01T00:00:00.000Z'),
      dateFin: new Date('2026-01-31T23:59:59.999Z'),
    });
  });
});

describe('DisputeService.getDisputeAdmin', () => {
  it('retourne le litige trouvé', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue({ id: LITIGE_ID });

    const result = await service.getDisputeAdmin(LITIGE_ID);

    expect(result).toEqual({ id: LITIGE_ID });
  });

  it('lève NotFoundError quand le litige est introuvable', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue(null);

    await expect(service.getDisputeAdmin('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DisputeService.exportCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const DISPUTE = {
    id: LITIGE_ID,
    motif: 'Œuvre non conforme',
    statut: 'OUVERT',
    createdAt: new Date('2026-09-02T08:00:00.000Z'),
    updatedAt: new Date('2026-09-02T09:00:00.000Z'),
    commande: {
      id: CMD_ID,
      dateCreation: new Date('2026-08-20T10:00:00.000Z'),
      statut: 'LIVREE',
      typeCommande: 'STANDARD',
      montantTotal: 250000,
      acheteur: {
        id: 'bp-1',
        user: { id: 'user-1', nom: 'Awa', telephone: '+22890000000', email: null },
      },
    },
    artisan: {
      id: 'art-1',
      nomAtelier: 'Atelier Badjok',
      user: { id: 'user-2', nom: 'Koffi', telephone: '+22891111111', email: null },
    },
  };

  it('écrit l’en-tête puis une ligne par litige', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([DISPUTE]);

    const csv = await service.exportCsv({});

    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      '"id","motif","statut","createdAt","updatedAt","idCommande","dateCommande","statutCommande","montantCommande","clientNom","clientTelephone","artisanNomAtelier","artisanNom","artisanTelephone"'
    );
    expect(lines[1]).toBe(
      `"${LITIGE_ID}","Œuvre non conforme","OUVERT","2026-09-02T08:00:00.000Z","2026-09-02T09:00:00.000Z","${CMD_ID}","2026-08-20T10:00:00.000Z","LIVREE","250000","Awa","+22890000000","Atelier Badjok","Koffi","+22891111111"`
    );
  });

  it('échappe les guillemets dans les cellules CSV', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([{ ...DISPUTE, motif: 'Œuvre "abîmée" au transport' }]);

    const csv = await service.exportCsv({});

    expect(csv).toContain('"Œuvre ""abîmée"" au transport"');
  });

  it('remplace les valeurs nulles par une cellule vide', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      {
        id: LITIGE_ID,
        motif: '',
        statut: 'OUVERT',
        createdAt: new Date('2026-09-02T08:00:00.000Z'),
        updatedAt: new Date('2026-09-02T09:00:00.000Z'),
        commande: null,
        artisan: null,
      },
    ]);

    const csv = await service.exportCsv({});

    const row = csv.split('\n')[1];
    expect(row).toContain('"","OUVERT"');
    expect(row.endsWith('"","",""' as string)).toBe(true);
  });

  it('exporte tous les résultats filtrés avec un cap de 5000 lignes', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([]);

    await service.exportCsv({ q: 'conforme', statut: 'EN_COURS' });

    expect(repository.findForExport).toHaveBeenCalledWith({ q: 'conforme', statut: 'EN_COURS' }, CSV_EXPORT_LIMIT);
    expect(CSV_EXPORT_LIMIT).toBe(5000);
  });
});