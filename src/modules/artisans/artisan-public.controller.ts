import type { NextFunction, Request, Response } from 'express';
import { ArtisanPublicService } from './artisan-public.service.js';
import {
  listArtisansQuerySchema,
  artisanParamsSchema,
  artisanOeuvresQuerySchema,
} from './artisan-public.schema.js';

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class ArtisanPublicController {
  constructor(private readonly service: ArtisanPublicService) {}

  // ---------------------------------------------------------------------------
  // GET /api/v1/artisans
  // ---------------------------------------------------------------------------

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listArtisansQuerySchema.parse(req.query);
      const result = await this.service.getPublicArtisans(
        query.page,
        query.limit,
        { q: query.q, pays: query.pays, ville: query.ville, specialite: query.specialite },
        query.tri
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // GET /api/v1/artisans/:identifier
  // ---------------------------------------------------------------------------

  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identifier } = artisanParamsSchema.parse(req.params);
      const artisan = await this.service.getPublicArtisan(identifier);
      res.status(200).json({ success: true, artisan });
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // GET /api/v1/artisans/:identifier/oeuvres
  // ---------------------------------------------------------------------------

  listOeuvres = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identifier } = artisanParamsSchema.parse(req.params);
      const query = artisanOeuvresQuerySchema.parse(req.query);
      const result = await this.service.getPublicArtisanOeuvres(
        identifier,
        query.page,
        query.limit
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
