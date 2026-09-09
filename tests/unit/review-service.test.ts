import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/common/errors/AppError.js';
import { CSV_EXPORT_LIMIT, ReviewService } from '../../src/modules/reviews/review.service.js';

function createRepository() {
  return {
    findAllForAdmin: vi.fn(),
    findByIdForAdmin: vi.fn(),
    findForExport: vi.fn(),
  };
}

function buildService(repository = createRepository()) {
  const service = new ReviewService(repository as any);
  return { service, repository };
}

const AVIS_ID = '123e4567-e89b-12d3-a456-426614174000';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174001';

describe('ReviewService.listAllAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcule totalPages = ceil(total / limit)', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ reviews: [], total: 42 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result).toEqual({ items: [], total: 42, page: 1, limit: 20, totalPages: 3 });
  });

  it('total = 0 → totalPages = 0', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ reviews: [], total: 0 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result.totalPages).toBe(0);
  });

  it('délègue les filtres au repository', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ reviews: [], total: 0 });

    await service.listAllAdmin(2, 10, {
      q: 'masque',
      note: 5,
      estVerifie: true,
      auteurId: 'user-1',
    });

    expect(repository.findAllForAdmin).toHaveBeenCalledWith(2, 10, {
      q: 'masque',
      note: 5,
      estVerifie: true,
      auteurId: 'user-1',
    });
  });
});

describe('ReviewService.getReviewAdmin', () => {
  it('retourne l’avis trouvé', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue({ id: AVIS_ID });

    const result = await service.getReviewAdmin(AVIS_ID);

    expect(result).toEqual({ id: AVIS_ID });
  });

  it('lève NotFoundError quand l’avis est introuvable', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue(null);

    await expect(service.getReviewAdmin('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ReviewService.exportCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const REVIEW = {
    id: AVIS_ID,
    note: 4,
    commentaire: 'Très belle pièce, je recommande.',
    dateAvis: new Date('2026-09-02T08:00:00.000Z'),
    estVerifie: true,
    commande: {
      id: CMD_ID,
      dateCreation: new Date('2026-08-20T10:00:00.000Z'),
      statut: 'LIVREE',
      typeCommande: 'STANDARD',
      acheteur: {
        id: 'bp-1',
        user: { id: 'user-1', nom: 'Awa', telephone: '+22890000000', email: null },
      },
    },
  };

  it('écrit l’en-tête puis une ligne par avis', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([REVIEW]);

    const csv = await service.exportCsv({});

    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      '"id","note","commentaire","estVerifie","dateAvis","idCommande","dateCommande","auteurNom","auteurTelephone","statutCommande"'
    );
    expect(lines[1]).toBe(
      `"${AVIS_ID}","4","Très belle pièce, je recommande.","true","2026-09-02T08:00:00.000Z","${CMD_ID}","2026-08-20T10:00:00.000Z","Awa","+22890000000","LIVREE"`
    );
  });

  it('échappe les guillemets dans les cellules CSV', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      { ...REVIEW, commentaire: 'Très belles "pièces" d’art' },
    ]);

    const csv = await service.exportCsv({});

    expect(csv).toContain('"Très belles ""pièces"" d’art"');
  });

  it('remplace les valeurs nulles par une cellule vide', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      {
        id: AVIS_ID,
        note: 3,
        commentaire: '',
        dateAvis: new Date('2026-09-02T08:00:00.000Z'),
        estVerifie: false,
        commande: null,
      },
    ]);

    const csv = await service.exportCsv({});

    const row = csv.split('\n')[1];
    expect(row).toContain('"3","","false"');
    expect(row).toContain('"",');
    expect(row.endsWith('"","",""' as string)).toBe(true);
  });

  it('exporte tous les résultats filtrés avec un cap de 5000 lignes', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([]);

    await service.exportCsv({ q: 'masque', note: 5 });

    expect(repository.findForExport).toHaveBeenCalledWith({ q: 'masque', note: 5 }, CSV_EXPORT_LIMIT);
    expect(CSV_EXPORT_LIMIT).toBe(5000);
  });
});