import type { NextFunction, Request, Response } from 'express';
import {
  deliveryIdParamsSchema,
  deliveryQuerySchema,
  updateDeliverySchema,
  updateDeliveryStatutSchema,
} from './delivery.schema.js';
import { DeliveryService } from './delivery.service.js';

export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = deliveryQuerySchema.parse(req.query);
      const result = await this.service.listAllAdmin(query.page, query.limit, {
        statut: query.statut,
        q: query.q,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = deliveryIdParamsSchema.parse(req.params);
      const livraison = await this.service.getDeliveryAdmin(id);
      res.status(200).json({ success: true, livraison });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = deliveryIdParamsSchema.parse(req.params);
      const input = updateDeliverySchema.parse(req.body);
      const livraison = await this.service.updateDelivery(id, input);
      res.status(200).json({ success: true, livraison });
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = deliveryIdParamsSchema.parse(req.params);
      const input = updateDeliveryStatutSchema.parse(req.body);
      const livraison = await this.service.updateStatus(id, input.statut);
      res.status(200).json({ success: true, livraison });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = deliveryQuerySchema.parse(req.query);
      const csv = await this.service.exportCsv({
        statut: query.statut,
        q: query.q,
      });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="livraisons-${Date.now()}.csv"`
        )
        .send(csv);
    } catch (error) {
      next(error);
    }
  };
}