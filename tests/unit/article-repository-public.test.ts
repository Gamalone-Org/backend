import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleRepository } from '../../src/modules/articles/article.repository';
import type { PrismaClient } from '../../src/generated/prisma/client';

const CATEGORIE_UUID = '123e4567-e89b-12d3-a456-426614174001';

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const findFirst = vi.fn();
  const $transaction = vi.fn(async (queries: unknown[]) =>
    Promise.all(queries as Promise<unknown>[])
  );
  const prisma = {
    article: { findMany, count, findFirst },
    $transaction,
  } as unknown as PrismaClient;
  const repository = new ArticleRepository(prisma, () => ({}) as never);
  return { repository, findMany, count, findFirst };
}

describe('ArticleRepository - visibilité publique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne sélectionne que les articles PUBLIE non supprimés', async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 1, limit: 20 });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('PUBLIE');
    expect(where.deletedAt).toBeNull();
  });

  it('applique le filtre categorieId', async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 1, limit: 20, categorieId: CATEGORIE_UUID });

    const where = findMany.mock.calls[0][0].where;
    expect(where.categorieId).toBe(CATEGORIE_UUID);
    expect(where.statut).toBe('PUBLIE');
  });

  it('applique la recherche q sur le contenu éditorial', async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 1, limit: 20, q: 'bronze' });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('PUBLIE');
    expect(where.OR).toBeDefined();
  });

  it('applique la pagination existante (skip/take)', async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 3, limit: 15 });

    expect(findMany.mock.calls[0][0].skip).toBe(30);
    expect(findMany.mock.calls[0][0].take).toBe(15);
  });

  it('trie par date de publication décroissante', async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 1, limit: 20 });

    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { datePublication: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it("exclut les champs internes d'administration de la projection publique", async () => {
    const { repository, findMany } = setup();

    await repository.listPublicArticles({ page: 1, limit: 20 });

    const select = findMany.mock.calls[0][0].select;
    for (const forbidden of [
      'statut',
      'deletedAt',
      'auteurId',
      'auteur',
      'publishedByAdminId',
      'publishedByAdmin',
      'imageCouverturePublicId',
      'datePlanification',
    ]) {
      expect(select).not.toHaveProperty(forbidden);
    }
    expect(select).toHaveProperty('id');
    expect(select).toHaveProperty('titre');
    expect(select).toHaveProperty('slug');
    expect(select).toHaveProperty('metaDescription');
    expect(select).toHaveProperty('imageCouvertureUrl');
    expect(select).toHaveProperty('datePublication');
    expect(select.categorie.select).toEqual({
      id: true,
      nom: true,
      slug: true,
      description: true,
      imageCouvertureUrl: true,
    });
  });

  it('findPublicArticleById filtre sur PUBLIE et deletedAt null', async () => {
    const { repository, findFirst } = setup();
    findFirst.mockResolvedValue(null);

    await repository.findPublicArticleById('article-1');

    const args = findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'article-1', statut: 'PUBLIE', deletedAt: null });
    expect(args.select).toHaveProperty('contenu');
    expect(args.select).not.toHaveProperty('statut');
    expect(args.select).not.toHaveProperty('publishedByAdminId');
    expect(args.select).not.toHaveProperty('auteur');
  });
});
