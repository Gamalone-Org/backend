import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewRepository } from '../../src/modules/reviews/review.repository.js';

function createPrismaMock() {
  return {
    avis: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function buildRepository(prisma = createPrismaMock()) {
  const repository = new ReviewRepository(prisma as any);
  return { repository, prisma };
}

const AVIS_ID = '123e4567-e89b-12d3-a456-426614174000';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174001';
const AUTEUR_ID = '123e4567-e89b-12d3-a456-426614174002';
const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174003';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174004';

describe('ReviewRepository.findAllForAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit un OR Prisma avec les 5 critères lorsqu’un q est fourni', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'chef-d’oeuvre' });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(5);
    expect(where.OR).toContainEqual({ id: { equals: 'chef-d’oeuvre' } });
    expect(where.OR).toContainEqual({ commandeId: { equals: 'chef-d’oeuvre' } });
    expect(where.OR).toContainEqual({
      commentaire: { contains: 'chef-d’oeuvre', mode: 'insensitive' },
    });
    expect(where.OR).toContainEqual({
      commande: { acheteur: { user: { nom: { contains: 'chef-d’oeuvre', mode: 'insensitive' } } } },
    });
    expect(where.OR).toContainEqual({
      commande: {
        lignesCommande: { some: { oeuvre: { titre: { contains: 'chef-d’oeuvre', mode: 'insensitive' } } } },
      },
    });
  });

  it('recherche un identifiant UUID en égalité stricte uniquement', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: CMD_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ id: { equals: CMD_ID } });
    expect(where.OR).toContainEqual({ commandeId: { equals: CMD_ID } });
  });

  it('recherche le commentaire avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'excellent' });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      commentaire: { contains: 'excellent', mode: 'insensitive' },
    });
  });

  it('recherche le nom de l’acheteur avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'awussi' });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      commande: { acheteur: { user: { nom: { contains: 'awussi', mode: 'insensitive' } } } },
    });
  });

  it('recherche le titre d’une oeuvre via les lignes de commande', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'masque' });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      commande: {
        lignesCommande: { some: { oeuvre: { titre: { contains: 'masque', mode: 'insensitive' } } } },
      },
    });
  });

  it('n’ajoute aucun OR lorsque q est absent', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('OR');
  });

  it('applique le filtre note seul (champ réel 1-5)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { note: 5 });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.note).toBe(5);
    expect(where.OR).toBeUndefined();
  });

  it('applique le filtre estVerifie (y compris false)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { estVerifie: false });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.estVerifie).toBe(false);
  });

  it('applique une plage de dates sur dateAvis', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);
    const debut = new Date('2026-01-01T00:00:00.000Z');
    const fin = new Date('2026-01-31T23:59:59.999Z');

    await repository.findAllForAdmin(1, 20, { dateDebut: debut, dateFin: fin });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.dateAvis).toEqual({ gte: debut, lte: fin });
  });

  it('applique dateDebut seul', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);
    const debut = new Date('2026-01-01T00:00:00.000Z');

    await repository.findAllForAdmin(1, 20, { dateDebut: debut });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.dateAvis).toEqual({ gte: debut });
  });

  it('filtre directement par commandeId (colonne réelle)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { commandeId: CMD_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.commandeId).toBe(CMD_ID);
  });

  it('filtre par auteur via commande.acheteur.userId', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { auteurId: AUTEUR_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.commande).toEqual({ acheteur: { userId: AUTEUR_ID } });
  });

  it('filtre par oeuvre via les lignes de commande', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { oeuvreId: OEUVRE_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.commande).toEqual({
      lignesCommande: { some: { oeuvreId: OEUVRE_ID } },
    });
  });

  it('filtre par artisan via les lignes de commande', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { artisanId: ARTISAN_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.commande).toEqual({
      lignesCommande: { some: { artisanId: ARTISAN_ID } },
    });
  });

  it('combine oeuvre et artisan dans un seul some sur la même ligne', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { oeuvreId: OEUVRE_ID, artisanId: ARTISAN_ID });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.commande).toEqual({
      lignesCommande: { some: { oeuvreId: OEUVRE_ID, artisanId: ARTISAN_ID } },
    });
  });

  it('combine la recherche q avec un filtre', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'masque', note: 5, estVerifie: true });

    const where = prisma.avis.findMany.mock.calls[0][0].where;
    expect(where.note).toBe(5);
    expect(where.estVerifie).toBe(true);
    expect(where.OR).toHaveLength(5);
  });

  it('applique la pagination skip = (page - 1) * limit et take = limit', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(3, 20, {});

    const { skip, take } = prisma.avis.findMany.mock.calls[0][0];
    expect(skip).toBe(40);
    expect(take).toBe(20);
  });

  it('trie par dateAvis décroissante', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);
    prisma.avis.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    expect(prisma.avis.findMany.mock.calls[0][0].orderBy).toEqual({ dateAvis: 'desc' });
  });

  it('compte avec le même where que la liste', async () => {
    const { repository, prisma } = buildRepository();
    const rows = [{ id: AVIS_ID }];
    prisma.avis.findMany.mockResolvedValue(rows);
    prisma.avis.count.mockResolvedValue(42);

    const result = await repository.findAllForAdmin(1, 20, { note: 5 });

    const listWhere = prisma.avis.findMany.mock.calls[0][0].where;
    const countWhere = prisma.avis.count.mock.calls[0][0].where;
    expect(listWhere).toEqual({ note: 5 });
    expect(countWhere).toEqual(listWhere);
    expect(result).toEqual({ reviews: rows, total: 42 });
  });
});

describe('ReviewRepository.findByIdForAdmin', () => {
  it('interroge prisma.avis.findUnique avec l’id et le select détail', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findUnique.mockResolvedValue({ id: AVIS_ID });

    await repository.findByIdForAdmin(AVIS_ID);

    expect(prisma.avis.findUnique).toHaveBeenCalledWith({
      where: { id: AVIS_ID },
      select: expect.objectContaining({ commande: expect.anything() }),
    });
  });

  it('retourne null quand l’avis n’existe pas', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findUnique.mockResolvedValue(null);

    const result = await repository.findByIdForAdmin('missing');

    expect(result).toBeNull();
  });
});

describe('ReviewRepository.findForExport', () => {
  it('applique les mêmes filtres que la liste avec un take borné', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([]);

    await repository.findForExport({ q: 'masque', note: 4 }, 5000);

    const { where, take, skip } = prisma.avis.findMany.mock.calls[0][0];
    expect(where.note).toBe(4);
    expect(where.OR).toHaveLength(5);
    expect(take).toBe(5000);
    expect(skip).toBeUndefined();
  });

  it('exporte les résultats filtrés sans pagination de page', async () => {
    const { repository, prisma } = buildRepository();
    prisma.avis.findMany.mockResolvedValue([{ id: AVIS_ID }]);

    const result = await repository.findForExport({}, 5000);

    expect(result).toEqual([{ id: AVIS_ID }]);
    expect(prisma.avis.count).not.toHaveBeenCalled();
  });
});