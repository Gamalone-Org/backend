import type { NextFunction, Request, Response } from 'express';
import {
  artisanParamsSchema,
  listArtisanArtworksQuerySchema,
  listArtisanOrdersQuerySchema,
  listArtisansQuerySchema,
} from './admin-artisans.schema.js';
import { AdminArtisansService, type AdminActor } from './admin-artisans.service.js';

function actorFrom(req: Request): AdminActor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    adminAccessLevel: req.user!.adminAccessLevel ?? null,
  };
}

export class AdminArtisansController {
  constructor(private readonly service: AdminArtisansService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listArtisansQuerySchema.parse(req.query);
      const result = await this.service.listArtisans(actorFrom(req), {
        page: query.page,
        limit: query.limit,
        q: query.q,
        kycStatus: query.kycStatus,
        kycPending: query.kycPending === undefined ? undefined : query.kycPending === 'true',
        accountStatus: query.accountStatus,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = artisanParamsSchema.parse(req.params);
      const artisan = await this.service.getArtisanDetail(actorFrom(req), id);
      res.status(200).json({ success: true, artisan });
    } catch (error) {
      next(error);
    }
  };

  listArtworks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = artisanParamsSchema.parse(req.params);
      const query = listArtisanArtworksQuerySchema.parse(req.query);
      const result = await this.service.listArtworks(actorFrom(req), id, {
        page: query.page,
        limit: query.limit,
        statut: query.statut,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = artisanParamsSchema.parse(req.params);
      const query = listArtisanOrdersQuerySchema.parse(req.query);
      const result = await this.service.listOrders(actorFrom(req), id, {
        page: query.page,
        limit: query.limit,
        statut: query.statut,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}