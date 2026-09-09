import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputeRepository } from '../../src/modules/disputes/dispute.repository.js';

function createPrismaMock() {
  return {
    litige: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function buildRepository(prisma = createPrismaMock()) {
  const repository = new DisputeRepository(prisma as any);
  return { repository, prisma };
}

const LITIGE_ID = '123e4567-e89b-12d3-a456-426614174200';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174201';
const CLIENT_ID = '123e4567-e89b-12d3-a456-426614174202';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174203';

describe('DisputeRepository.findAllForAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit un OR Prisma avec les 6 critères lorsqu’un q est fourni', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'conforme' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(6);
    expect(where.OR).toContainEqual({ id: { equals: 'conforme' } });
    expect(where.OR).toContainEqual({ commandeId: { equals: 'conforme' } });
    expect(where.OR).toContainEqual({ motif: { contains: 'conforme', mode: 'insensitive' } });
    expect(where.OR).toContainEqual({ id: { equals: 'conforme' } });
  });

  it('recherche un identifiant UUID en égalité stricte uniquement', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: CMD_ID });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ id: { equals: CMD_ID } });
    expect(where.OR).toContainEqual({ commandeId: { equals: CMD_ID } });
  });

  it('recherche le motif avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'sculpture fissurée' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      motif: { contains: 'sculpture fissurée', mode: 'insensitive' },
    });
  });

  it('recherche l’artisan via nomAtelier ou nom de la personne', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'Atelier Badjok' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      artisan: {
        OR: [
          { nomAtelier: { contains: 'Atelier Badjok', mode: 'insensitive' } },
          { user: { nom: { contains: 'Atelier Badjok', mode: 'insensitive' } } },
        ],
      },
    });
  });

  it('recherche le nom du client via commande.acheteur.user.nom', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'awussi' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      commande: { acheteur: { user: { nom: { contains: 'awussi', mode: 'insensitive' } } } },
    });
  });

  it('recherche le titre d’une oeuvre via les lignes de commande', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'masque' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      commande: {
        lignesCommande: { some: { oeuvre: { titre: { contains: 'masque', mode: 'insensitive' } } } },
      },
    });
  });

  it('n’ajoute aucun OR lorsque q est absent', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('OR');
  });

  it('applique le filtre statut réel du modèle', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { statut: 'OUVERT' });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('OUVERT');
    expect(where.OR).toBeUndefined();
  });

  it('filtre directement par commandeId (colonne réelle)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { commandeId: CMD_ID });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.commandeId).toBe(CMD_ID);
  });

  it('filtre directement par artisanId (colonne réelle)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { artisanId: ARTISAN_ID });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.artisanId).toBe(ARTISAN_ID);
  });

  it('filtre par client via commande.acheteur.userId', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { clientId: CLIENT_ID });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.commande).toEqual({ acheteur: { userId: CLIENT_ID } });
  });

  it('applique une plage de dates sur createdAt', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);
    const debut = new Date('2026-01-01T00:00:00.000Z');
    const fin = new Date('2026-01-31T23:59:59.999Z');

    await repository.findAllForAdmin(1, 20, { dateDebut: debut, dateFin: fin });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: debut, lte: fin });
  });

  it('applique dateDebut seul', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);
    const debut = new Date('2026-01-01T00:00:00.000Z');

    await repository.findAllForAdmin(1, 20, { dateDebut: debut });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gte: debut });
  });

  it('combine la recherche q avec un filtre', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'conforme', statut: 'EN_COURS', clientId: CLIENT_ID });

    const where = prisma.litige.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('EN_COURS');
    expect(where.commande).toEqual({ acheteur: { userId: CLIENT_ID } });
    expect(where.OR).toHaveLength(6);
  });

  it('applique la pagination skip = (page - 1) * limit et take = limit', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(3, 20, {});

    const { skip, take } = prisma.litige.findMany.mock.calls[0][0];
    expect(skip).toBe(40);
    expect(take).toBe(20);
  });

  it('trie par createdAt décroissante', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);
    prisma.litige.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    expect(prisma.litige.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('compte avec le même where que la liste', async () => {
    const { repository, prisma } = buildRepository();
    const rows = [{ id: LITIGE_ID }];
    prisma.litige.findMany.mockResolvedValue(rows);
    prisma.litige.count.mockResolvedValue(42);

    const result = await repository.findAllForAdmin(1, 20, { statut: 'OUVERT' });

    const listWhere = prisma.litige.findMany.mock.calls[0][0].where;
    const countWhere = prisma.litige.count.mock.calls[0][0].where;
    expect(listWhere).toEqual({ statut: 'OUVERT' });
    expect(countWhere).toEqual(listWhere);
    expect(result).toEqual({ disputes: rows, total: 42 });
  });
});

describe('DisputeRepository.findByIdForAdmin', () => {
  it('interroge prisma.litige.findUnique avec l’id et le select détail', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findUnique.mockResolvedValue({ id: LITIGE_ID });

    await repository.findByIdForAdmin(LITIGE_ID);

    expect(prisma.litige.findUnique).toHaveBeenCalledWith({
      where: { id: LITIGE_ID },
      select: expect.objectContaining({ commande: expect.anything() }),
    });
  });

  it('retourne null quand le litige n’existe pas', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findUnique.mockResolvedValue(null);

    const result = await repository.findByIdForAdmin('missing');

    expect(result).toBeNull();
  });
});

describe('DisputeRepository.findForExport', () => {
  it('applique les mêmes filtres que la liste avec un take borné', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([]);

    await repository.findForExport({ q: 'conforme', statut: 'OUVERT' }, 5000);

    const { where, take, skip } = prisma.litige.findMany.mock.calls[0][0];
    expect(where.statut).toBe('OUVERT');
    expect(where.OR).toHaveLength(6);
    expect(take).toBe(5000);
    expect(skip).toBeUndefined();
  });

  it('exporte les résultats filtrés sans pagination de page', async () => {
    const { repository, prisma } = buildRepository();
    prisma.litige.findMany.mockResolvedValue([{ id: LITIGE_ID }]);

    const result = await repository.findForExport({}, 5000);

    expect(result).toEqual([{ id: LITIGE_ID }]);
    expect(prisma.litige.count).not.toHaveBeenCalled();
  });
});