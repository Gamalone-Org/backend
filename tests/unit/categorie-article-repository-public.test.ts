import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieArticleRepository } from '../../src/modules/categories-article/categorie-article.repository.js';

function buildRepo() {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const $transaction = vi.fn(async (queries: unknown[]) =>
    Promise.all(queries as Promise<unknown>[])
  );
  const prisma = {
    categorieArticle: { findMany, count },
    $transaction,
  } as any;
  const repository = new CategorieArticleRepository(prisma, () => ({}) as never);
  return { repository, findMany };
}

describe('CategorieArticleRepository - visibilité publique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne retourne que les catégories ACTIVE', async () => {
    const { repository, findMany } = buildRepo();

    await repository.listPublicCategoriesArticle({ page: 1, limit: 20 });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('ACTIVE');
  });

  it('applique la recherche q sur le nom', async () => {
    const { repository, findMany } = buildRepo();

    await repository.listPublicCategoriesArticle({ page: 1, limit: 20, q: 'peint' });

    const where = findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('ACTIVE');
    expect(where.nom).toEqual({ contains: 'peint', mode: 'insensitive' });
  });

  it('applique la pagination et le tri alphabétique', async () => {
    const { repository, findMany } = buildRepo();

    await repository.listPublicCategoriesArticle({ page: 2, limit: 10 });

    const args = findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual([{ nom: 'asc' }]);
  });

  it("exclut les champs internes de la projection publique", async () => {
    const { repository, findMany } = buildRepo();

    await repository.listPublicCategoriesArticle({ page: 1, limit: 20 });

    const select = findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('statut');
    expect(select).not.toHaveProperty('imageCouverturePublicId');
    expect(select).not.toHaveProperty('_count');
    expect(select).toEqual({
      id: true,
      nom: true,
      slug: true,
      description: true,
      imageCouvertureUrl: true,
    });
  });
});
