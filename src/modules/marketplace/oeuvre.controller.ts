import type { NextFunction, Request, Response } from 'express';
import { OeuvreService } from './oeuvre.service.js';
import { MediaService } from './media.service.js';
import {
  createOeuvreSchema,
  updateOeuvreSchema,
  reorderMediasSchema,
  oeuvreIdParamsSchema,
  artisanOeuvreParamsSchema,
  oeuvreMediaParamsSchema,
  oeuvreReorderParamsSchema,
  publicOeuvreQuerySchema,
  artisanOeuvresQuerySchema,
  adminOeuvresQuerySchema,
  featuredQuerySchema,
  mediaTypeQuerySchema,
} from './oeuvre.schema.js';
import type { PublicOeuvreSelect, AdminOeuvreSelect } from './types.js';
import { detectMimeTypeFromMagicBytes } from '../kyc/middleware/kyc-upload.middleware.js';
import { ValidationError } from '../../common/errors/AppError.js';

const publicSelect: PublicOeuvreSelect = {
  id: true,
  titre: true,
  description: true,
  technique: true,
  materiaux: true,
  dimensions: true,
  poids: true,
  anneeCreation: true,
  prixXOF: true,
  statut: true,
  disponibilite: true,
  estMiseEnAvant: true,
  createdAt: true,
  updatedAt: true,
  artisan: {
    select: {
      id: true,
      type: true,
      nomAtelier: true,
      specialite: true,
      localisation: true,
      estCertifie: true,
      photoAtelierUrl: true,
      user: {
        select: { id: true, nom: true },
      },
    },
  },
  categorie: {
    select: { id: true, nom: true, description: true },
  },
  medias: {
    orderBy: { ordre: 'asc' as const },
    select: { id: true, url: true, mimeType: true, type: true, width: true, height: true, ordre: true },
  },
  certificat: {
    select: { id: true, codeQR: true, dateEmission: true, estValide: true },
  },
};

const adminSelect: AdminOeuvreSelect = {
  ...publicSelect,
  rejectionReason: true,
  publishedByAdminId: true,
  artisan: {
    ...publicSelect.artisan,
    user: {
      select: { id: true, nom: true, telephone: true },
    },
  },
};

export class OeuvreController {
  constructor(
    private readonly oeuvreService: OeuvreService,
    private readonly mediaService: MediaService
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createOeuvreSchema.parse(req.body);
      const { artisanId, ...oeuvreInput } = input;
      const oeuvre = await this.oeuvreService.createOeuvre(artisanId, oeuvreInput);
      res.status(201).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  listMy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = artisanOeuvresQuerySchema.parse(req.query);
      const result = await this.oeuvreService.getMyOeuvres(
        req.user!.id,
        query.page,
        query.limit,
        query.statut
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getMy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const oeuvre = await this.oeuvreService.getMyOeuvre(req.user!.id, id);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const input = updateOeuvreSchema.parse(req.body);
      const oeuvre = await this.oeuvreService.updateOeuvre(id, input);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      await this.oeuvreService.deleteOeuvre(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const oeuvre = await this.oeuvreService.publishOeuvre(req.user!.id, id);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  withdrawAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const oeuvre = await this.oeuvreService.withdrawOeuvreAdmin(id);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  uploadMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const rawType = mediaTypeQuerySchema.parse(req.query.type);
      const type = rawType === 'ATELIER' ? 'OEUVRE' : rawType;
      const file = req.file;

      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError(
          'Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP'
        );
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError(
          "Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP"
        );
      }

      const media = await this.mediaService.uploadMedia(
        id,
        file.buffer,
        {
          domain: 'artworks',
          mimeType: detectedMime,
          bytes: file.size,
        },
        {
          width: undefined,
          height: undefined,
        },
        type
      );

      res.status(201).json({ success: true, media });
    } catch (error) {
      next(error);
    }
  };

  deleteMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, mediaId } = oeuvreMediaParamsSchema.parse(req.params);
      await this.mediaService.deleteMedia(id, mediaId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  reorderMedias = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreReorderParamsSchema.parse(req.params);
      const input = reorderMediasSchema.parse(req.body);
      await this.mediaService.reorderMedias(id, input.mediaIds);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  uploadPhotoAtelier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { artisanId } = artisanOeuvreParamsSchema.parse(req.params);
      const file = req.file;

      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError(
          'Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP'
        );
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError(
          "Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP"
        );
      }

      const photo = await this.mediaService.setPhotoAtelier(
        artisanId,
        file.buffer,
        {
          domain: 'artworks',
          mimeType: detectedMime,
          bytes: file.size,
        }
      );

      res.status(200).json({ success: true, ...photo });
    } catch (error) {
      next(error);
    }
  };

  deletePhotoAtelier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { artisanId } = artisanOeuvreParamsSchema.parse(req.params);
      await this.mediaService.deletePhotoAtelier(artisanId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  listAllAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminOeuvresQuerySchema.parse(req.query);
      const result = await this.oeuvreService.getAllAdmin(
        query.page,
        query.limit,
        {
          statut: query.statut,
          artisanId: query.artisanId,
          categorieId: query.categorieId,
          disponibilite: query.disponibilite,
          q: query.q,
        },
        adminSelect
      );
      const oeuvres = result.oeuvres ?? [];
      const totalPages = Math.ceil((result.total ?? 0) / query.limit);
      res.status(200).json({
        success: true,
        items: oeuvres,
        oeuvres,
        total: result.total ?? 0,
        page: query.page,
        limit: query.limit,
        totalPages,
      });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminOeuvresQuerySchema.parse(req.query);
      const csv = await this.oeuvreService.exportCsv(
        {
          statut: query.statut,
          artisanId: query.artisanId,
          categorieId: query.categorieId,
          disponibilite: query.disponibilite,
          q: query.q,
        },
        adminSelect
      );
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="oeuvres-${Date.now()}.csv"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  };

  getOeuvreAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const oeuvre = await this.oeuvreService.getOeuvreAdmin(id);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  listPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = publicOeuvreQuerySchema.parse(req.query);
      const result = await this.oeuvreService.getPublishedPublic(
        query.page,
        query.limit,
        {
          categorieId: query.categorieId,
          prixMin: query.prixMin,
          prixMax: query.prixMax,
          artisanType: query.artisanType,
          localisation: query.localisation,
          q: query.q,
          tri: query.tri,
          disponibilite: query.disponibilite,
        },
        publicSelect
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listFeatured = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = featuredQuerySchema.parse(req.query);
      const oeuvres = await this.oeuvreService.getFeatured(query.limit, publicSelect);
      res.status(200).json({ success: true, oeuvres });
    } catch (error) {
      next(error);
    }
  };

  getPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = oeuvreIdParamsSchema.parse(req.params);
      const oeuvre = await this.oeuvreService.getOeuvrePublic(id, publicSelect);
      res.status(200).json({ success: true, oeuvre });
    } catch (error) {
      next(error);
    }
  };

  listByArtisanPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { artisanId } = artisanOeuvreParamsSchema.parse(req.params);
      const query = publicOeuvreQuerySchema.parse(req.query);
      const result = await this.oeuvreService.getOeuvresByArtisanPublic(
        artisanId,
        query.page,
        query.limit,
        publicSelect
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
