import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleService } from '../../src/modules/articles/article.service';
import { ArticleRepository } from '../../src/modules/articles/article.repository';
import { NotFoundError } from '../../src/common/errors/AppError';

const ARTICLE_UUID = '123e4567-e89b-12d3-a456-426614174010';

const makePublicArticle = (overrides: Record<string, unknown> = {}) => ({
  id: ARTICLE_UUID,
  titre: 'Le bronze au Togo',
  slug: 'le-bronze-au-togo',
  metaDescription: 'Un savoir-faire',
  contenu: 'Contenu complet',
  imageCouvertureUrl: null,
  datePublication: new Date('2026-06-15T10:00:00.000Z'),
  createdAt: new Date('2026-06-01T10:00:00.000Z'),
  updatedAt: new Date('2026-06-15T10:00:00.000Z'),
  categorie: { id: 'cat-1', nom: 'Artisanat', slug: 'artisanat' },
  ...overrides,
});

function buildService(overrides: Partial<ArticleRepository> = {}) {
  const repository = {
    listPublicArticles: vi.fn(),
    findPublicArticleById: vi.fn(),
    ...overrides,
  } as unknown as ArticleRepository;
  return { service: new ArticleService(repository), repository };
}

describe('ArticleService - consultation publique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('délègue la liste publique au repository', async () => {
    const { service, repository } = buildService();
    repository.listPublicArticles.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const result = await service.listPublicArticles({ page: 1, limit: 20, q: 'bronze' });

    expect(repository.listPublicArticles).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: 'bronze',
    });
    expect(result.total).toBe(0);
  });

  it("renvoie le détail d'un article publié", async () => {
    const { service, repository } = buildService();
    repository.findPublicArticleById.mockResolvedValue(makePublicArticle());

    const result = await service.getPublicArticle(ARTICLE_UUID);

    expect(repository.findPublicArticleById).toHaveBeenCalledWith(ARTICLE_UUID);
    expect(result.titre).toBe('Le bronze au Togo');
  });

  it('renvoie 404 (NotFoundError) pour un article non publié ou inexistant', async () => {
    const { service, repository } = buildService();
    repository.findPublicArticleById.mockResolvedValue(null);

    await expect(service.getPublicArticle(ARTICLE_UUID)).rejects.toThrow(NotFoundError);
  });
});
