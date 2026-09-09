import type { NextFunction, Request, Response } from 'express';
import { disputeIdParamsSchema, disputeQuerySchema } from './dispute.schema.js';
import { DisputeService } from './dispute.service.js';

export class DisputeController {
  constructor(private readonly service: DisputeService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = disputeQuerySchema.parse(req.query);
      const result = await this.service.listAllAdmin(query.page, query.limit, {
        q: query.q,
        statut: query.statut,
        commandeId: query.commandeId,
        clientId: query.clientId,
        artisanId: query.artisanId,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = disputeIdParamsSchema.parse(req.params);
      const litige = await this.service.getDisputeAdmin(id);
      res.status(200).json({ success: true, litige });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = disputeQuerySchema.parse(req.query);
      const csv = await this.service.exportCsv({
        q: query.q,
        statut: query.statut,
        commandeId: query.commandeId,
        clientId: query.clientId,
        artisanId: query.artisanId,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
      });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="litiges-${Date.now()}.csv"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  };
}