import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleRepository } from '../../src/modules/articles/article.repository';
import type { PrismaClient } from '../../src/generated/prisma/client';

const AUTEUR_UUID = '123e4567-e89b-12d3-a456-426614174002';
const CATEGORIE_UUID = '123e4567-e89b-12d3-a456-426614174001';
const DATE_DEBUT = new Date('2026-01-01T00:00:00.000Z');
const DATE_FIN = new Date('2026-12-31T23:59:59.999Z');

function setup() {
  const findMany = vi.fn();
  const count = vi.fn();
  const $transaction = vi.fn(
    async (queries: unknown[]) => Promise.all(queries as Promise<unknown>[])
  );
  const prisma = {
    article: { findMany, count },
    $transaction,
  } as unknown as PrismaClient;
  const repository = new ArticleRepository(
    prisma,
    () => ({}) as never
  );
  return { repository, findMany, count };
}

describe('ArticleRepository - construction du where', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a single OR over titre, contenu, slug, categorie.nom and auteur.user.nom when q is provided', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, q: 'cire' });

    const where = findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([
      { titre: { contains: 'cire', mode: 'insensitive' } },
      { contenu: { contains: 'cire', mode: 'insensitive' } },
      { slug: { contains: 'cire', mode: 'insensitive' } },
      { categorie: { nom: { contains: 'cire', mode: 'insensitive' } } },
      { auteur: { user: { nom: { contains: 'cire', mode: 'insensitive' } } } },
    ]);
  });

  it('does not generate any OR when q is absent', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20 });

    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ deletedAt: null });
    expect(where.OR).toBeUndefined();
  });

  it('filters by auteurId', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, auteurId: AUTEUR_UUID });

    expect(findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      auteurId: AUTEUR_UUID,
    });
  });

  it('filters by dateDebut alone (createdAt gte)', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, dateDebut: DATE_DEBUT });

    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: DATE_DEBUT });
  });

  it('filters by dateFin alone (createdAt lte)', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, dateFin: DATE_FIN });

    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({ lte: DATE_FIN });
  });

  it('filters by both dateDebut and dateFin (createdAt range)', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, dateDebut: DATE_DEBUT, dateFin: DATE_FIN });

    expect(findMany.mock.calls[0][0].where.createdAt).toEqual({
      gte: DATE_DEBUT,
      lte: DATE_FIN,
    });
  });

  it('combines q with statut', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 1, limit: 20, q: 'cire', statut: 'PUBLIE' });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('PUBLIE');
    expect(where.OR).toBeDefined();
  });

  it('combines auteurId with categorieId', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({
      page: 1,
      limit: 20,
      auteurId: AUTEUR_UUID,
      categorieId: CATEGORIE_UUID,
    });

    expect(findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      auteurId: AUTEUR_UUID,
      categorieId: CATEGORIE_UUID,
    });
  });

  it('combines date filters with statut', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({
      page: 1,
      limit: 20,
      dateDebut: DATE_DEBUT,
      dateFin: DATE_FIN,
      statut: 'PLANIFIE',
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('PLANIFIE');
    expect(where.createdAt).toEqual({ gte: DATE_DEBUT, lte: DATE_FIN });
  });

  it('applies the exact same where to count and findMany', async () => {
    const { repository, findMany, count } = setup();
    await repository.listArticles({ page: 2, limit: 10, q: 'bois', auteurId: AUTEUR_UUID });

    expect(count.mock.calls[0][0].where).toBe(findMany.mock.calls[0][0].where);
  });

  it('applies the existing pagination (skip/take) to findMany', async () => {
    const { repository, findMany } = setup();
    await repository.listArticles({ page: 3, limit: 15 });

    expect(findMany.mock.calls[0][0].skip).toBe(30);
    expect(findMany.mock.calls[0][0].take).toBe(15);
  });
});

describe('ArticleRepository - export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the same filters to findForExport as the list', async () => {
    const { repository, findMany } = setup();
    await repository.findForExport(
      { page: 1, limit: 20, q: 'cire', statut: 'BROUILLON', auteurId: AUTEUR_UUID },
      5000
    );

    const args = findMany.mock.calls[0][0];
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.statut).toBe('BROUILLON');
    expect(args.where.auteurId).toBe(AUTEUR_UUID);
    expect(args.where.OR).toBeDefined();
  });

  it('caps the export at the requested limit without user pagination', async () => {
    const { repository, findMany } = setup();
    await repository.findForExport({ page: 1, limit: 20 }, 5000);

    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(5000);
    expect(args.skip).toBeUndefined();
  });

  it('returns the articles selected for export', async () => {
    const { repository, findMany } = setup();
    const article = {
      id: 'id-1',
      titre: 'Titre',
      statut: 'BROUILLON',
      categorie: { nom: 'Savoir-faire' },
      auteur: { user: { nom: 'Awa' } },
    };
    findMany.mockResolvedValue([article]);

    const result = await repository.findForExport({ page: 1, limit: 20 }, 5000);
    expect(result).toEqual([article]);
  });
});