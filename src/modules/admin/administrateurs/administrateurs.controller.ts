import type { NextFunction, Request, Response } from 'express';
import {
  createAdministrateurSchema,
  updateAdministrateurSchema,
  updateAdministrateurPermissionsSchema,
  updateAdministrateurStatutSchema,
  listAdministrateursQuerySchema,
  administrateurParamsSchema,
} from './administrateurs.schema.js';
import { AdministrateurService } from './administrateurs.service.js';
import type { Actor } from './administrateurs.types.js';

function actorFrom(req: Request): Actor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    adminAccessLevel: req.user!.adminAccessLevel ?? null,
    adminProfileId: req.user!.adminProfileId ?? null,
  };
}

export class AdministrateurController {
  constructor(private readonly service: AdministrateurService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listAdministrateursQuerySchema.parse(req.query);
      const result = await this.service.list(actorFrom(req), query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = administrateurParamsSchema.parse(req.params);
      const admin = await this.service.getById(actorFrom(req), id);
      res.status(200).json({ success: true, admin });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createAdministrateurSchema.parse(req.body);
      const admin = await this.service.create(actorFrom(req), input);
      res.status(201).json({ success: true, admin });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = administrateurParamsSchema.parse(req.params);
      const input = updateAdministrateurSchema.parse(req.body);
      const admin = await this.service.update(actorFrom(req), id, input);
      res.status(200).json({ success: true, admin });
    } catch (error) {
      next(error);
    }
  };

  updatePermissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = administrateurParamsSchema.parse(req.params);
      const input = updateAdministrateurPermissionsSchema.parse(req.body);
      const admin = await this.service.updatePermissions(actorFrom(req), id, input);
      res.status(200).json({ success: true, admin });
    } catch (error) {
      next(error);
    }
  };

  updateStatut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = administrateurParamsSchema.parse(req.params);
      const input = updateAdministrateurStatutSchema.parse(req.body);
      const admin = await this.service.updateStatut(actorFrom(req), id, input);
      res.status(200).json({ success: true, admin });
    } catch (error) {
      next(error);
    }
  };
}
