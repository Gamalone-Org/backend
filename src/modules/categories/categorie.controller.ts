import type { NextFunction, Request, Response } from 'express';
import {
  categorieIdParamsSchema,
  categorieParamsSchema,
  createCategorieSchema,
  createSousCategorieSchema,
  listCategoriesQuerySchema,
  sousCategorieIdParamsSchema,
  updateCategorieSchema,
  updateSousCategorieSchema,
} from './categorie.schema.js';
import { CategorieService } from './categorie.service.js';
import { ValidationError } from '../../common/errors/AppError.js';
import { detectMimeTypeFromMagicBytes } from '../kyc/middleware/kyc-upload.middleware.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const IMAGE_DOMAIN = 'media' as const;

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

export class CategorieController {
  constructor(private readonly service: CategorieService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listCategoriesQuerySchema.parse(req.query);
      const result = await this.service.listCategories({
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

  listPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listCategoriesQuerySchema.parse(req.query);
      const result = await this.service.listPublicCategories({
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
      const { id } = categorieIdParamsSchema.parse(req.params);
      const categorie = await this.service.getCategorie(id);
      res.status(200).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  getOnePublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieIdParamsSchema.parse(req.params);
      const categorie = await this.service.getPublicCategorie(id);
      res.status(200).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listCategoriesQuerySchema.parse(req.query);
      const csv = await this.service.exportCsv({ statut: query.statut, q: query.q });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="categories-${Date.now()}.csv"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createCategorieSchema.parse(req.body);
      const categorie = await this.service.createCategorie(input);
      res.status(201).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieIdParamsSchema.parse(req.params);
      const input = updateCategorieSchema.parse(req.body);
      const categorie = await this.service.updateCategorie(id, input);
      res.status(200).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieIdParamsSchema.parse(req.params);
      await this.service.deleteCategorie(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  uploadImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieIdParamsSchema.parse(req.params);
      const file = assertImageFile(req);
      const categorie = await this.service.uploadCategorieImage(id, file.buffer, {
        domain: IMAGE_DOMAIN,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
      res.status(200).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  deleteImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = categorieIdParamsSchema.parse(req.params);
      const categorie = await this.service.deleteCategorieImage(id);
      res.status(200).json({ success: true, categorie });
    } catch (error) {
      next(error);
    }
  };

  listSousCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categorieId } = categorieParamsSchema.parse(req.params);
      const sousCategories = await this.service.listPublicSousCategories(categorieId);
      res.status(200).json({ success: true, sousCategories });
    } catch (error) {
      next(error);
    }
  };

  createSousCategorie = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categorieId } = sousCategorieIdParamsSchema.parse(req.params);
      const input = createSousCategorieSchema.parse(req.body);
      const sousCategorie = await this.service.createSousCategorie(categorieId, input);
      res.status(201).json({ success: true, sousCategorie });
    } catch (error) {
      next(error);
    }
  };

  updateSousCategorie = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categorieId, sousCategorieId } = sousCategorieIdParamsSchema.parse(req.params);
      const input = updateSousCategorieSchema.parse(req.body);
      const sousCategorie = await this.service.updateSousCategorie(categorieId, sousCategorieId, input);
      res.status(200).json({ success: true, sousCategorie });
    } catch (error) {
      next(error);
    }
  };

  removeSousCategorie = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categorieId, sousCategorieId } = sousCategorieIdParamsSchema.parse(req.params);
      await this.service.deleteSousCategorie(categorieId, sousCategorieId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  uploadSousCategorieImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sousCategorieId } = sousCategorieIdParamsSchema.parse(req.params);
      const file = assertImageFile(req);
      const sousCategorie = await this.service.uploadSousCategorieImage(sousCategorieId, file.buffer, {
        domain: IMAGE_DOMAIN,
        mimeType: file.mimeType,
        bytes: file.bytes,
      });
      res.status(200).json({ success: true, sousCategorie });
    } catch (error) {
      next(error);
    }
  };

  deleteSousCategorieImage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sousCategorieId } = sousCategorieIdParamsSchema.parse(req.params);
      const sousCategorie = await this.service.deleteSousCategorieImage(sousCategorieId);
      res.status(200).json({ success: true, sousCategorie });
    } catch (error) {
      next(error);
    }
  };
}
