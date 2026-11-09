import type { Request, Response, NextFunction } from 'express';
import { PayoutService } from './payout.service.js';
import {
  payoutAdminQuerySchema,
  payoutCommandeArtisanParamsSchema,
  payoutIdParamsSchema,
} from './payout.schema.js';

export class PayoutController {
  constructor(private readonly service: PayoutService) {}

  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = payoutAdminQuerySchema.parse(req.query);
      const result = await this.service.listForAdmin(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listAEfectuer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = payoutAdminQuerySchema.parse(req.query);
      const result = await this.service.listAEfectuer(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutIdParamsSchema.parse(req.params);
      const reversement = await this.service.getForAdmin(id);
      res.status(200).json({ success: true, reversement });
    } catch (error) {
      next(error);
    }
  };

  declencher = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { commandeArtisanId } = payoutCommandeArtisanParamsSchema.parse(req.params);
      const result = await this.service.declencherPayout(commandeArtisanId, req.user!.id);
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  relancer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutIdParamsSchema.parse(req.params);
      const result = await this.service.relancerPayout(id, req.user!.id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  synchroniser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutIdParamsSchema.parse(req.params);
      const result = await this.service.synchroniserPayout(id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
