import type { NextFunction, Request, Response } from 'express';
import { ArtisanProfileService } from './artisan-profile.service.js';
import {
  updateProfilSchema,
  updateVersementSchema,
  atelierPhotoParamsSchema,
  reorderAtelierPhotosSchema,
  createProcessusSchema,
  updateProcessusSchema,
  processusParamsSchema,
  reorderProcessusSchema,
  createExpositionSchema,
  updateExpositionSchema,
  expositionParamsSchema,
} from './artisan-profile.schema.js';
import { detectMimeTypeFromMagicBytes } from '../kyc/middleware/kyc-upload.middleware.js';
import { ValidationError } from '../../common/errors/AppError.js';

export class ArtisanProfileController {
  constructor(private readonly service: ArtisanProfileService) {}

  // ---------------------------------------------------------------------------
  // Profil principal
  // ---------------------------------------------------------------------------

  getMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.service.getMyProfile(req.user!.id);
      res.status(200).json({ success: true, profil: profile });
    } catch (error) {
      next(error);
    }
  };

  updateMyProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateProfilSchema.parse(req.body);
      const profile = await this.service.updateMyProfile(req.user!.id, input);
      res.status(200).json({ success: true, profil: profile });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Photo profil
  // ---------------------------------------------------------------------------

  uploadPhotoProfil = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError('Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP');
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
      }

      const result = await this.service.uploadPhotoProfil(req.user!.id, file.buffer, {
        domain: 'artworks',
        mimeType: detectedMime,
        bytes: file.size,
      });

      res.status(200).json({
        success: true,
        photoProfilUrl: result.photoProfilUrl,
        photoProfilMimeType: result.photoProfilMimeType,
        photoProfilSize: result.photoProfilSize,
      });
    } catch (error) {
      next(error);
    }
  };

  deletePhotoProfil = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deletePhotoProfil(req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Bannière
  // ---------------------------------------------------------------------------

  uploadBanniere = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError('Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP');
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
      }

      const result = await this.service.uploadBanniere(req.user!.id, file.buffer, {
        domain: 'artworks',
        mimeType: detectedMime,
        bytes: file.size,
      });

      res.status(200).json({
        success: true,
        photoBanniereUrl: result.photoBanniereUrl,
        photoBanniereMimeType: result.photoBanniereMimeType,
        photoBanniereSize: result.photoBanniereSize,
      });
    } catch (error) {
      next(error);
    }
  };

  deleteBanniere = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deleteBanniere(req.user!.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Photos atelier
  // ---------------------------------------------------------------------------

  getAtelierPhotos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const photos = await this.service.getAtelierPhotos(req.user!.id);
      res.status(200).json({ success: true, photos });
    } catch (error) {
      next(error);
    }
  };

  uploadAtelierPhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError('Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP');
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
      }

      const photo = await this.service.uploadAtelierPhoto(req.user!.id, file.buffer, {
        domain: 'artworks',
        mimeType: detectedMime,
        bytes: file.size,
      });

      res.status(201).json({ success: true, photo });
    } catch (error) {
      next(error);
    }
  };

  deleteAtelierPhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { photoId } = atelierPhotoParamsSchema.parse(req.params);
      await this.service.deleteAtelierPhoto(req.user!.id, photoId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  reorderAtelierPhotos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = reorderAtelierPhotosSchema.parse(req.body);
      await this.service.reorderAtelierPhotos(req.user!.id, input.photoIds);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Processus de création
  // ---------------------------------------------------------------------------

  getProcessus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const etapes = await this.service.getProcessus(req.user!.id);
      res.status(200).json({ success: true, etapes });
    } catch (error) {
      next(error);
    }
  };

  createProcessusEtape = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createProcessusSchema.parse(req.body);
      const etape = await this.service.createProcessusEtape(req.user!.id, input);
      res.status(201).json({ success: true, etape });
    } catch (error) {
      next(error);
    }
  };

  updateProcessusEtape = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { etapeId } = processusParamsSchema.parse(req.params);
      const input = updateProcessusSchema.parse(req.body);
      const etape = await this.service.updateProcessusEtape(req.user!.id, etapeId, input);
      res.status(200).json({ success: true, etape });
    } catch (error) {
      next(error);
    }
  };

  deleteProcessusEtape = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { etapeId } = processusParamsSchema.parse(req.params);
      await this.service.deleteProcessusEtape(req.user!.id, etapeId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  uploadProcessusPhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { etapeId } = processusParamsSchema.parse(req.params);
      const file = req.file;
      if (!file) {
        throw new ValidationError('Un fichier image est requis');
      }

      const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
      if (!detectedMime) {
        throw new ValidationError('Type de fichier non reconnu. Formats acceptés : JPEG, PNG, WEBP');
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as readonly string[];
      if (!allowedTypes.includes(detectedMime)) {
        throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
      }

      const etape = await this.service.uploadProcessusPhoto(req.user!.id, etapeId, file.buffer, {
        domain: 'artworks',
        mimeType: detectedMime,
        bytes: file.size,
      });

      res.status(200).json({ success: true, etape });
    } catch (error) {
      next(error);
    }
  };

  reorderProcessus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = reorderProcessusSchema.parse(req.body);
      await this.service.reorderProcessus(req.user!.id, input.etapeIds);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Expositions
  // ---------------------------------------------------------------------------

  getExpositions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expositions = await this.service.getExpositions(req.user!.id);
      res.status(200).json({ success: true, expositions });
    } catch (error) {
      next(error);
    }
  };

  createExposition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createExpositionSchema.parse(req.body);
      const exposition = await this.service.createExposition(req.user!.id, input);
      res.status(201).json({ success: true, exposition });
    } catch (error) {
      next(error);
    }
  };

  updateExposition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { expositionId } = expositionParamsSchema.parse(req.params);
      const input = updateExpositionSchema.parse(req.body);
      const exposition = await this.service.updateExposition(req.user!.id, expositionId, input);
      res.status(200).json({ success: true, exposition });
    } catch (error) {
      next(error);
    }
  };

  deleteExposition = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { expositionId } = expositionParamsSchema.parse(req.params);
      await this.service.deleteExposition(req.user!.id, expositionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Versements (privé)
  // ---------------------------------------------------------------------------

  updateVersement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateVersementSchema.parse(req.body);
      const preference = await this.service.updateVersement(req.user!.id, input);
      res.status(200).json({ success: true, preference });
    } catch (error) {
      next(error);
    }
  };
}
