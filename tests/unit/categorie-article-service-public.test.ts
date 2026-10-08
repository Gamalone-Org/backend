import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieArticleService } from '../../src/modules/categories-article/categorie-article.service.js';
import { CategorieArticleRepository } from '../../src/modules/categories-article/categorie-article.repository.js';

const CAT_ID = '123e4567-e89b-12d3-a456-426614174001';

function buildService(overrides: Partial<CategorieArticleRepository> = {}) {
  const repository = {
    listPublicCategoriesArticle: vi.fn(),
    ...overrides,
  } as unknown as CategorieArticleRepository;
  return { service: new CategorieArticleService(repository), repository };
}

describe('CategorieArticleService - consultation publique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('délègue la liste publique et calcule totalPages', async () => {
    const { service, repository } = buildService();
    repository.listPublicCategoriesArticle.mockResolvedValue({
      items: [{ id: CAT_ID, nom: 'Peinture', slug: 'peinture', description: '', imageCouvertureUrl: null }],
      total: 21,
      page: 1,
      limit: 20,
    });

    const result = await service.listPublicCategoriesArticle({ page: 1, limit: 20, q: 'peint' });

    expect(repository.listPublicCategoriesArticle).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: 'peint',
    });
    expect(result.totalPages).toBe(2);
  });

  it('totalPages vaut 0 quand la liste est vide', async () => {
    const { service, repository } = buildService();
    repository.listPublicCategoriesArticle.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const result = await service.listPublicCategoriesArticle({ page: 1, limit: 20 });

    expect(result.totalPages).toBe(0);
  });
});
