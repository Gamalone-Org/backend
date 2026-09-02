import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleService } from '../../src/modules/articles/article.service';
import { ArticleRepository } from '../../src/modules/articles/article.repository';
import { ConflictError, NotFoundError, ValidationError } from '../../src/common/errors/AppError';
import { Prisma } from '../../src/generated/prisma/client';

const CATEGORY_UUID = '123e4567-e89b-12d3-a456-426614174001';
const ADMIN_USER_UUID = '123e4567-e89b-12d3-a456-426614174002';
const ADMIN_PROFILE_UUID = '123e4567-e89b-12d3-a456-426614174003';

const makeArticle = (overrides: Record<string, unknown> = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174010',
  titre: 'Mon premier article',
  contenu: 'Contenu riche',
  slug: 'mon-premier-article',
  metaDescription: null,
  statut: 'BROUILLON',
  datePublication: null,
  datePlanification: null,
  categorieId: CATEGORY_UUID,
  imageCouvertureUrl: null,
  imageCouverturePublicId: null,
  auteurId: ADMIN_PROFILE_UUID,
  publishedByAdminId: null,
  deletedAt: null,
  ...overrides,
});

function buildService(overrides: Partial<ArticleRepository> = {}) {
  const repository = {
    findCategorieById: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    softDeleteArticle: vi.fn(),
    findArticleById: vi.fn(),
    findArticleBySlug: vi.fn(),
    findAdminProfileIdByUserId: vi.fn(),
    listArticles: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ArticleRepository;
  const service = new ArticleService(repository);
  return { service, repository };
}

describe('ArticleService - création & slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an article as BROUILLON with an auto-generated slug', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, nom: 'Cat', statut: 'ACTIVE' });
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.findArticleBySlug.mockResolvedValue(null);
    repository.createArticle.mockResolvedValue(makeArticle());

    const result = await service.createArticle(ADMIN_USER_UUID, {
      titre: '  Mon premier article  ',
      contenu: 'Contenu riche',
      categorieId: CATEGORY_UUID,
    });

    expect(repository.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({
        titre: 'Mon premier article',
        slug: 'mon-premier-article',
        auteurId: ADMIN_PROFILE_UUID,
        categorieId: CATEGORY_UUID,
      })
    );
    expect(result.slug).toBe('mon-premier-article');
  });

  it('records the authenticated admin as author', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, statut: 'ACTIVE' });
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.findArticleBySlug.mockResolvedValue(null);
    repository.createArticle.mockResolvedValue(makeArticle());

    await service.createArticle(ADMIN_USER_UUID, {
      titre: 'Article',
      contenu: 'c',
      categorieId: CATEGORY_UUID,
    });

    expect(repository.findAdminProfileIdByUserId).toHaveBeenCalledWith(ADMIN_USER_UUID);
    expect(repository.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({ auteurId: ADMIN_PROFILE_UUID })
    );
  });

  it('rejects creation when no admin profile exists', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, statut: 'ACTIVE' });
    repository.findAdminProfileIdByUserId.mockResolvedValue(null);

    await expect(
      service.createArticle(ADMIN_USER_UUID, {
        titre: 'Article',
        contenu: 'c',
        categorieId: CATEGORY_UUID,
      })
    ).rejects.toThrow(ConflictError);
    expect(repository.createArticle).not.toHaveBeenCalled();
  });

  it('rejects creation when the category does not exist', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.createArticle(ADMIN_USER_UUID, {
        titre: 'Article',
        contenu: 'c',
        categorieId: CATEGORY_UUID,
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects creation when the category is inactive', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, statut: 'INACTIVE' });

    await expect(
      service.createArticle(ADMIN_USER_UUID, {
        titre: 'Article',
        contenu: 'c',
        categorieId: CATEGORY_UUID,
      })
    ).rejects.toThrow(ValidationError);
    expect(repository.createArticle).not.toHaveBeenCalled();
  });

  it('slugifies accented titles', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, statut: 'ACTIVE' });
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.findArticleBySlug.mockResolvedValue(null);
    repository.createArticle.mockResolvedValue(makeArticle());

    await service.createArticle(ADMIN_USER_UUID, {
      titre: 'Ébénisterie d’art',
      contenu: 'c',
      categorieId: CATEGORY_UUID,
    });

    expect(repository.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ebenisterie-d-art' })
    );
  });

  it('disambiguates slug collisions with a numeric suffix', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: CATEGORY_UUID, statut: 'ACTIVE' });
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.findArticleBySlug
      .mockResolvedValueOnce({ id: 'other', slug: 'mon-premier-article' })
      .mockResolvedValueOnce(null);
    repository.createArticle.mockResolvedValue(makeArticle());

    await service.createArticle(ADMIN_USER_UUID, {
      titre: 'Mon premier article',
      contenu: 'c',
      categorieId: CATEGORY_UUID,
    });

    expect(repository.createArticle).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'mon-premier-article-2' })
    );
  });
});

describe('ArticleService - modification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates an editable BROUILLON article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.updateArticle.mockResolvedValue(makeArticle({ contenu: 'nouveau' }));

    const result = await service.updateArticle('article-1', { contenu: 'nouveau' });

    expect(repository.updateArticle).toHaveBeenCalledWith('article-1', { contenu: 'nouveau' });
    expect(result.contenu).toBe('nouveau');
  });

  it('regenerates the slug when the title changes', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ slug: 'mon-premier-article' }));
    repository.findArticleBySlug.mockResolvedValue(null);
    repository.updateArticle.mockResolvedValue(makeArticle({ titre: 'Nouveau titre' }));

    await service.updateArticle('article-1', { titre: 'Nouveau titre' });

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ titre: 'Nouveau titre', slug: 'nouveau-titre' })
    );
  });

  it('keeps the current slug when it already matches the title', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ slug: 'mon-premier-article' }));
    repository.findArticleBySlug = vi.fn();
    repository.updateArticle.mockResolvedValue(makeArticle({ titre: 'Mon premier article' }));

    await service.updateArticle('article-1', { titre: 'Mon premier article' });

    expect(repository.findArticleBySlug).not.toHaveBeenCalled();
    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ slug: 'mon-premier-article' })
    );
  });

  it('refuses to edit a PUBLIE article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ statut: 'PUBLIE' }));

    await expect(service.updateArticle('article-1', { contenu: 'x' })).rejects.toThrow(
      ConflictError
    );
    expect(repository.updateArticle).not.toHaveBeenCalled();
  });

  it('rejects update when article does not exist', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(null);

    await expect(service.updateArticle('missing', { contenu: 'x' })).rejects.toThrow(
      NotFoundError
    );
  });

  it('rejects update when category does not exist', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.updateArticle('article-1', { categorieId: CATEGORY_UUID })
    ).rejects.toThrow(NotFoundError);
  });

  it('changes the category of an editable article', async () => {
    const { service, repository } = buildService();
    const NEW_CATEGORY = '123e4567-e89b-12d3-a456-426614174099';
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.findCategorieById.mockResolvedValue({ id: NEW_CATEGORY, statut: 'ACTIVE' });
    repository.updateArticle.mockResolvedValue(makeArticle({ categorieId: NEW_CATEGORY }));

    const result = await service.updateArticle('article-1', { categorieId: NEW_CATEGORY });

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ categorieId: NEW_CATEGORY })
    );
    expect(result.categorieId).toBe(NEW_CATEGORY);
  });

  it('refuses to change the category to an inactive one', async () => {
    const { service, repository } = buildService();
    const NEW_CATEGORY = '123e4567-e89b-12d3-a456-426614174098';
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.findCategorieById.mockResolvedValue({ id: NEW_CATEGORY, statut: 'INACTIVE' });

    await expect(
      service.updateArticle('article-1', { categorieId: NEW_CATEGORY })
    ).rejects.toThrow(ValidationError);
    expect(repository.updateArticle).not.toHaveBeenCalled();
  });
});

describe('ArticleService - workflow de publication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a BROUILLON article and records the publishing admin', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.updateArticle.mockResolvedValue(makeArticle({ statut: 'PUBLIE' }));

    const result = await service.publishArticle(ADMIN_USER_UUID, 'article-1');

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({
        statut: 'PUBLIE',
        publishedByAdminId: ADMIN_PROFILE_UUID,
        datePlanification: null,
      })
    );
    expect(result.statut).toBe('PUBLIE');
  });

  it('publishes a PLANIFIE article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ statut: 'PLANIFIE', datePlanification: new Date('2030-01-01') })
    );
    repository.findAdminProfileIdByUserId.mockResolvedValue({ id: ADMIN_PROFILE_UUID });
    repository.updateArticle.mockResolvedValue(makeArticle({ statut: 'PUBLIE' }));

    await service.publishArticle(ADMIN_USER_UUID, 'article-1');

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ statut: 'PUBLIE' })
    );
  });

  it('refuses to publish an already published article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ statut: 'PUBLIE' }));

    await expect(service.publishArticle(ADMIN_USER_UUID, 'article-1')).rejects.toThrow(
      ConflictError
    );
    expect(repository.updateArticle).not.toHaveBeenCalled();
  });

  it('schedules a BROUILLON article to PLANIFIE with a date', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.updateArticle.mockResolvedValue(
      makeArticle({ statut: 'PLANIFIE', datePlanification: new Date('2030-01-01') })
    );

    const result = await service.scheduleArticle('article-1', {
      datePlanification: '2030-01-01T00:00:00.000Z',
    });

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ statut: 'PLANIFIE', datePlanification: new Date('2030-01-01T00:00:00.000Z') })
    );
    expect(result.statut).toBe('PLANIFIE');
  });

  it('refuses to schedule a non-BROUILLON article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ statut: 'PUBLIE' }));

    await expect(
      service.scheduleArticle('article-1', { datePlanification: '2030-01-01T00:00:00.000Z' })
    ).rejects.toThrow(ConflictError);
  });

  it('rejects an invalid schedule date', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());

    await expect(
      service.scheduleArticle('article-1', { datePlanification: 'not-a-date' })
    ).rejects.toThrow(ValidationError);
  });

  it('unpublishes a PUBLIE article back to BROUILLON', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ statut: 'PUBLIE', datePublication: new Date() })
    );
    repository.updateArticle.mockResolvedValue(makeArticle({ statut: 'BROUILLON' }));

    const result = await service.unpublishArticle('article-1');

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ statut: 'BROUILLON', datePublication: null })
    );
    expect(result.statut).toBe('BROUILLON');
  });

  it('unpublishes a PLANIFIE article back to BROUILLON', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ statut: 'PLANIFIE', datePlanification: new Date('2030-01-01') })
    );
    repository.updateArticle.mockResolvedValue(makeArticle({ statut: 'BROUILLON' }));

    await service.unpublishArticle('article-1');

    expect(repository.updateArticle).toHaveBeenCalledWith(
      'article-1',
      expect.objectContaining({ statut: 'BROUILLON', datePlanification: null })
    );
  });

  it('refuses to unpublish an already BROUILLON article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle({ statut: 'BROUILLON' }));

    await expect(service.unpublishArticle('article-1')).rejects.toThrow(ConflictError);
  });
});

describe('ArticleService - suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes an article and removes its cover image', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ imageCouverturePublicId: 'pub-1' })
    );
    repository.softDeleteArticle.mockResolvedValue(
      makeArticle({ deletedAt: new Date(), imageCouverturePublicId: 'pub-1' })
    );

    await service.deleteArticle('article-1');

    expect(repository.softDeleteArticle).toHaveBeenCalledWith('article-1');
    expect(repository.deleteImage).toHaveBeenCalledWith('pub-1');
  });

  it('does not delete the cover image when there is none', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());
    repository.softDeleteArticle.mockResolvedValue(makeArticle({ deletedAt: new Date() }));

    await service.deleteArticle('article-1');

    expect(repository.deleteImage).not.toHaveBeenCalled();
  });

  it('rejects deletion of an unknown article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(null);

    await expect(service.deleteArticle('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('ArticleService - image de couverture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a cover image and replaces the previous one', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ imageCouverturePublicId: 'old-pub' })
    );
    repository.uploadImage.mockResolvedValue({
      imageCouvertureUrl: 'https://cdn/cover.jpg',
      imageCouverturePublicId: 'new-pub',
    });
    repository.updateArticle.mockResolvedValue(makeArticle());

    await service.uploadArticleCover('article-1', Buffer.from('data'), {
      domain: 'articles',
      mimeType: 'image/png',
      bytes: 10,
    });

    expect(repository.deleteImage).toHaveBeenCalledWith('old-pub');
    expect(repository.updateArticle).toHaveBeenCalledWith('article-1', {
      imageCouvertureUrl: 'https://cdn/cover.jpg',
      imageCouverturePublicId: 'new-pub',
    });
  });

  it('rejects an unsupported mime type', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());

    await expect(
      service.uploadArticleCover('article-1', Buffer.from('data'), {
        domain: 'articles',
        mimeType: 'application/pdf',
        bytes: 10,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('deletes the cover image', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({ imageCouverturePublicId: 'pub-1', imageCouvertureUrl: 'https://x' })
    );
    repository.deleteImage.mockResolvedValue(undefined);
    repository.updateArticle.mockResolvedValue(makeArticle());

    await service.deleteArticleCover('article-1');

    expect(repository.deleteImage).toHaveBeenCalledWith('pub-1');
    expect(repository.updateArticle).toHaveBeenCalledWith('article-1', {
      imageCouvertureUrl: null,
      imageCouverturePublicId: null,
    });
  });

  it('rejects deleting the cover image when none is set', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(makeArticle());

    await expect(service.deleteArticleCover('article-1')).rejects.toThrow(NotFoundError);
  });
});

describe('ArticleService - récupération', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an article with its related categorie', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(
      makeArticle({
        categorie: { id: CATEGORY_UUID, nom: 'Éditorial', statut: 'ACTIVE' },
      })
    );

    const result = await service.getArticle('article-1');

    expect(repository.findArticleById).toHaveBeenCalledWith('article-1');
    expect(result.categorie).toMatchObject({ id: CATEGORY_UUID, nom: 'Éditorial' });
  });

  it('throws NotFoundError for an unknown article', async () => {
    const { service, repository } = buildService();
    repository.findArticleById.mockResolvedValue(null);

    await expect(service.getArticle('missing')).rejects.toThrow(NotFoundError);
  });
});
