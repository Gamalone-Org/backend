import type { NextFunction, Request, Response } from 'express';
import { OrderService } from './order.service.js';
import {
  createCommandeSchema,
  commandeIdParamsSchema,
  statutCommandeSchema,
  adminCommandesQuerySchema,
  myCommandesQuerySchema,
  artisanCommandesQuerySchema,
  commandeArtisanIdParamsSchema,
} from './order.schema.js';

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createCommandeSchema.parse(req.body);
      const result = await this.orderService.createCommande(req.user!.id, input);
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = myCommandesQuerySchema.parse(req.query);
      const result = await this.orderService.getMyCommandes(
        req.user!.id,
        query.page,
        query.limit,
        { statuts: query.statut, q: query.q, tri: query.tri }
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeIdParamsSchema.parse(req.params);
      const commande = await this.orderService.getMyCommande(req.user!.id, id);
      res.status(200).json({ success: true, commande });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminCommandesQuerySchema.parse(req.query);
      const result = await this.orderService.getAllAdmin(
        query.page,
        query.limit,
        { statut: query.statut, q: query.q }
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listArtisan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = artisanCommandesQuerySchema.parse(req.query);
      const result = await this.orderService.getMyCommandesArtisan(
        req.user!.id,
        query.page,
        query.limit,
        { statut: query.statut, q: query.q }
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getArtisan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeArtisanIdParamsSchema.parse(req.params);
      const commandeArtisan = await this.orderService.getMyCommandeArtisan(req.user!.id, id);
      res.status(200).json({ success: true, commandeArtisan });
    } catch (error) {
      next(error);
    }
  };

  preparer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeArtisanIdParamsSchema.parse(req.params);
      const result = await this.orderService.preparer(req.user!.id, id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  expedier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeArtisanIdParamsSchema.parse(req.params);
      const result = await this.orderService.expedier(req.user!.id, id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeIdParamsSchema.parse(req.params);
      const commande = await this.orderService.getCommandeAdmin(id);
      res.status(200).json({ success: true, commande });
    } catch (error) {
      next(error);
    }
  };

  updateStatut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeIdParamsSchema.parse(req.params);
      const input = statutCommandeSchema.parse(req.body);
      const commande = await this.orderService.updateStatut(id, input.statut);
      res.status(200).json({ success: true, commande });
    } catch (error) {
      next(error);
    }
  };

  annuler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = commandeIdParamsSchema.parse(req.params);
      const commande = await this.orderService.annuler(id);
      res.status(200).json({ success: true, commande });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminCommandesQuerySchema.parse(req.query);
      const csv = await this.orderService.exportCsv({
        statut: query.statut,
        q: query.q,
      });
      res
        .status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="commandes-${Date.now()}.csv"`
        )
        .send(csv);
    } catch (error) {
      next(error);
    }
  };
}
