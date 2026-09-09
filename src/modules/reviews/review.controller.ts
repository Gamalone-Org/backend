import type { NextFunction, Request, Response } from 'express';
import { reviewIdParamsSchema, reviewQuerySchema } from './review.schema.js';
import { ReviewService } from './review.service.js';

export class ReviewController {
  constructor(private readonly service: ReviewService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = reviewQuerySchema.parse(req.query);
      const result = await this.service.listAllAdmin(query.page, query.limit, {
        q: query.q,
        note: query.note,
        estVerifie: query.estVerifie,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
        commandeId: query.commandeId,
        auteurId: query.auteurId,
        oeuvreId: query.oeuvreId,
        artisanId: query.artisanId,
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = reviewIdParamsSchema.parse(req.params);
      const avis = await this.service.getReviewAdmin(id);
      res.status(200).json({ success: true, avis });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = reviewQuerySchema.parse(req.query);
      const csv = await this.service.exportCsv({
        q: query.q,
        note: query.note,
        estVerifie: query.estVerifie,
        dateDebut: query.dateDebut,
        dateFin: query.dateFin,
        commandeId: query.commandeId,
        auteurId: query.auteurId,
        oeuvreId: query.oeuvreId,
        artisanId: query.artisanId,
      });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="avis-${Date.now()}.csv"`)
        .send(csv);
    } catch (error) {
      next(error);
    }
  };
}