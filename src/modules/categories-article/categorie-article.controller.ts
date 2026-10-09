import type { NextFunction, Request, Response } from 'express';
import {
  categorieArticleIdParamsSchema,
  createCategorieArticleSchema,
  listCategoriesArticleQuerySchema,
  publicListCategoriesArticleQuerySchema,
  updateCategorieArticleSchema,
} from './categorie-article.schema.js';
import { CategorieArticleService } from './categorie-article.service.js';
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

/**
 * Back-office des catégories d'articles.
 *
 * Le JSON expose la clé `categorieArticle` (et non `categorie`) pour ne
 * jamais confondre avec la réponse des catégories d'œuvres.
 */
export class CategorieArticleController {
  constructor(private readonly service: CategorieArticleService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listCategoriesArticleQuerySchema.parse(req.query);
      const result = await this.service.listCategoriesArticle({
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        statut: query.statut,
        q: query.q,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  // --- Consultation publique (sans authentification) ---

  listPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = publicListCategoriesArticleQuerySchema.parse(req.query);
      const result = await this.service.listPublicCategoriesArticle({
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        q: query.q,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieArticleIdParamsSchema.parse(req.params);
      const categorieArticle = await this.service.getCategorieArticle(id);
      res.status(200).json({ success: true, categorieArticle });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createCategorieArticleSchema.parse(req.body);
      const categorieArticle = await this.service.createCategorieArticle(input);
      res.status(201).json({ success: true, categorieArticle });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieArticleIdParamsSchema.parse(req.params);
      const input = updateCategorieArticleSchema.parse(req.body);
      const categorieArticle = await this.service.updateCategorieArticle(id, input);
      res.status(200).json({ success: true, categorieArticle });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieArticleIdParamsSchema.parse(req.params);
      await this.service.deleteCategorieArticle(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  uploadImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieArticleIdParamsSchema.parse(req.params);
      const file = assertImageFile(req);
      const categorieArticle = await this.service.uploadCategorieArticleImage(id, file.buffer, {
        domain: IMAGE_DOMAIN,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
      res.status(200).json({ success: true, categorieArticle });
    } catch (error) {
      next(error);
    }
  };

  deleteImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieArticleIdParamsSchema.parse(req.params);
      const categorieArticle = await this.service.deleteCategorieArticleImage(id);
      res.status(200).json({ success: true, categorieArticle });
    } catch (error) {
      next(error);
    }
  };
}
