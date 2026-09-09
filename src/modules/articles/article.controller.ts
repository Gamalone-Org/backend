import type { NextFunction, Request, Response } from 'express';
import {
  articleIdParamsSchema,
  createArticleSchema,
  listArticlesQuerySchema,
  scheduleArticleSchema,
  updateArticleSchema,
} from './article.schema.js';
import { ArticleService } from './article.service.js';
import { ValidationError } from '../../common/errors/AppError.js';
import { detectMimeTypeFromMagicBytes } from '../kyc/middleware/kyc-upload.middleware.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const IMAGE_DOMAIN = 'articles' as const;

function assertImageFile(req: Request): { buffer: Buffer; mimeType: string; bytes: number } {
  const file = req.file;
  if (!file) {
    throw new ValidationError('Un fichier image est requis');
  }
  const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
  if (!detectedMime || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detectedMime)) {
    throw new ValidationError('Format d\u2019image non autorisé. Formats acceptés : JPEG, PNG, WEBP');
  }
  return { buffer: file.buffer, mimeType: detectedMime, bytes: file.size };
}

export class ArticleController {
  constructor(private readonly service: ArticleService) {}

  // --- Article ---

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listArticlesQuerySchema.parse(req.query);
      const result = await this.service.listArticles({
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        statut: query.statut,
        categorieId: query.categorieId,
        auteurId: query.auteurId,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
        q: query.q,
        tri: query.tri,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  exportArticles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listArticlesQuerySchema.parse(req.query);
      const csv = await this.service.exportCsv({
        page: query.page,
        limit: query.limit,
        statut: query.statut,
        categorieId: query.categorieId,
        auteurId: query.auteurId,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
        q: query.q,
        tri: query.tri,
      });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="articles-${Date.now()}.csv"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const article = await this.service.getArticle(id);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createArticleSchema.parse(req.body);
      const article = await this.service.createArticle(req.user!.id, input);
      res.status(201).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const input = updateArticleSchema.parse(req.body);
      const article = await this.service.updateArticle(id, input);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      await this.service.deleteArticle(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const article = await this.service.publishArticle(req.user!.id, id);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const input = scheduleArticleSchema.parse(req.body);
      const article = await this.service.scheduleArticle(id, input);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  unpublish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const article = await this.service.unpublishArticle(id);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  uploadCover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const file = assertImageFile(req);
      const article = await this.service.uploadArticleCover(id, file.buffer, {
        domain: IMAGE_DOMAIN,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };

  deleteCover = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = articleIdParamsSchema.parse(req.params);
      const article = await this.service.deleteArticleCover(id);
      res.status(200).json({ success: true, article });
    } catch (error) {
      next(error);
    }
  };
}
