import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/common/errors/AppError.js';
import {
  CSV_EXPORT_LIMIT,
  DeliveryService,
} from '../../src/modules/deliveries/delivery.service.js';

function createRepository() {
  return {
    findAllForAdmin: vi.fn(),
    findByIdForAdmin: vi.fn(),
    findByIdSummary: vi.fn(),
    updateDelivery: vi.fn(),
    updateStatus: vi.fn(),
    findForExport: vi.fn(),
  };
}

function buildService(repository = createRepository()) {
  const service = new DeliveryService(repository as any);
  return { service, repository };
}

describe('DeliveryService.listAllAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calcule totalPages = ceil(total / limit)', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ livraisons: [], total: 42 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result).toEqual({ items: [], total: 42, page: 1, limit: 20, totalPages: 3 });
  });

  it('total = 0 → totalPages = 0', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ livraisons: [], total: 0 });

    const result = await service.listAllAdmin(1, 20, {});

    expect(result.totalPages).toBe(0);
  });

  it('délègue les filtres au repository', async () => {
    const { service, repository } = buildService();
    repository.findAllForAdmin.mockResolvedValue({ livraisons: [], total: 0 });

    await service.listAllAdmin(2, 10, { q: 'DHL', statut: 'EN_TRANSIT' });

    expect(repository.findAllForAdmin).toHaveBeenCalledWith(2, 10, {
      q: 'DHL',
      statut: 'EN_TRANSIT',
    });
  });
});

describe('DeliveryService.getDeliveryAdmin', () => {
  it('retourne la livraison trouvée', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue({ id: 'del-1' });

    const result = await service.getDeliveryAdmin('del-1');

    expect(result).toEqual({ id: 'del-1' });
  });

  it('lève NotFoundError quand la livraison est introuvable', async () => {
    const { service, repository } = buildService();
    repository.findByIdForAdmin.mockResolvedValue(null);

    await expect(service.getDeliveryAdmin('missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DeliveryService.updateDelivery', () => {
  it('lève NotFoundError quand la livraison est introuvable', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue(null);

    await expect(service.updateDelivery('missing', { transporteur: 'DHL' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(repository.updateDelivery).not.toHaveBeenCalled();
  });

  it('met à jour le transporteur via le repository dédié', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'del-1', statut: 'EN_ATTENTE' });
    repository.updateDelivery.mockResolvedValue({
      id: 'del-1',
      transporteur: 'Chronopost',
      numeroSuivi: null,
      statut: 'EN_ATTENTE',
    });

    const result = await service.updateDelivery('del-1', { transporteur: 'Chronopost' });

    expect(repository.updateDelivery).toHaveBeenCalledWith('del-1', { transporteur: 'Chronopost' });
    expect(result.transporteur).toBe('Chronopost');
  });

  it('renseigne le numeroSuivi', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'del-1', statut: 'EN_ATTENTE' });

    await service.updateDelivery('del-1', { numeroSuivi: 'TG48-851' });

    expect(repository.updateDelivery).toHaveBeenCalledWith('del-1', { numeroSuivi: 'TG48-851' });
  });
});

describe('DeliveryService.updateStatus', () => {
  it('lève NotFoundError quand la livraison est introuvable', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue(null);

    await expect(service.updateStatus('missing', 'EXPEDIEE')).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });

  it('met à jour le statut via le repository dédié', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'del-1', statut: 'EN_ATTENTE' });
    repository.updateStatus.mockResolvedValue({ id: 'del-1', statut: 'EXPEDIEE' });

    const result = await service.updateStatus('del-1', 'EXPEDIEE');

    expect(repository.updateStatus).toHaveBeenCalledWith('del-1', 'EXPEDIEE');
    expect(result.statut).toBe('EXPEDIEE');
  });
});

describe('DeliveryService.exportCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('écrit l’en-tête puis une ligne par livraison', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      {
        id: 'del-1',
        commande: { id: 'cmd-1', dateCreation: new Date('2026-09-01T10:00:00.000Z'), statut: 'COMMANDE' },
        transporteur: 'DHL',
        numeroSuivi: 'TG48-851',
        adresseDest: 'Lomé, Tokoin',
        frais: 1000,
        statut: 'EN_TRANSIT',
      },
    ]);

    const csv = await service.exportCsv({});

    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      '"idLivraison","idCommande","transporteur","numeroSuivi","destination","frais","statut","dateCommande"'
    );
    expect(lines[1]).toBe(
      '"del-1","cmd-1","DHL","TG48-851","Lomé, Tokoin","1000","EN_TRANSIT","2026-09-01T10:00:00.000Z"'
    );
  });

  it('échappe les guillemets dans les cellules CSV', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      {
        id: 'del-1',
        commande: { id: 'cmd-1', dateCreation: new Date('2026-09-01T10:00:00.000Z'), statut: 'COMMANDE' },
        transporteur: 'Chronopost "Pro"',
        numeroSuivi: null,
        adresseDest: 'Lomé',
        frais: 0,
        statut: 'EN_ATTENTE',
      },
    ]);

    const csv = await service.exportCsv({});

    expect(csv).toContain('"Chronopost ""Pro"""');
  });

  it('remplace les valeurs nulles par une cellule vide', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([
      {
        id: 'del-1',
        commande: null,
        transporteur: 'DHL',
        numeroSuivi: null,
        adresseDest: '',
        frais: 500,
        statut: 'EN_ATTENTE',
      },
    ]);

    const csv = await service.exportCsv({});

    const row = csv.split('\n')[1];
    expect(row).toContain('"del-1",""');
    expect(row).toContain('"DHL","",""');
    expect(row).toContain('"",');
  });

  it('exporte tous les résultats filtrés avec un cap de 5000 lignes', async () => {
    const { service, repository } = buildService();
    repository.findForExport.mockResolvedValue([]);

    await service.exportCsv({ q: 'DHL', statut: 'EN_TRANSIT' });

    expect(repository.findForExport).toHaveBeenCalledWith(
      { q: 'DHL', statut: 'EN_TRANSIT' },
      CSV_EXPORT_LIMIT
    );
    expect(CSV_EXPORT_LIMIT).toBe(5000);
  });
});