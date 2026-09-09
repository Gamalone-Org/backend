import type { NextFunction, Request, Response } from 'express';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserRoleSchema,
  updateUserStatutSchema,
  userParamsSchema,
} from './users.schema.js';
import { UserService } from './users.service.js';
import type { Actor } from './users.service.js';

function actorFrom(req: Request): Actor {
  return {
    id: req.user!.id,
    role: req.user!.role,
    adminAccessLevel: req.user!.adminAccessLevel ?? null,
  };
}

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listUsersQuerySchema.parse(req.query);
      const result = await this.service.listUsers(actorFrom(req), {
        page: query.page,
        limit: query.limit,
        q: query.q,
        role: query.role,
        statut: query.statut,
        bloques: query.bloques === undefined ? undefined : query.bloques === 'true',
      });
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = userParamsSchema.parse(req.params);
      const user = await this.service.getById(actorFrom(req), id);
      res.status(200).json({ success: true, user });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createUserSchema.parse(req.body);
      const user = await this.service.createUser(actorFrom(req), input);
      res.status(201).json({ success: true, user });
    } catch (error) {
      next(error);
    }
  };

  updateStatut = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = userParamsSchema.parse(req.params);
      const input = updateUserStatutSchema.parse(req.body);
      const user = await this.service.updateStatut(actorFrom(req), id, input);
      res.status(200).json({ success: true, user });
    } catch (error) {
      next(error);
    }
  };

  updateRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = userParamsSchema.parse(req.params);
      const input = updateUserRoleSchema.parse(req.body);
      const user = await this.service.updateRole(actorFrom(req), id, input);
      res.status(200).json({ success: true, user });
    } catch (error) {
      next(error);
    }
  };

  exportCsv = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = listUsersQuerySchema.parse(req.query);
      const { csv } = await this.service.exportUsers(actorFrom(req), {
        q: query.q,
        role: query.role,
        statut: query.statut,
        bloques: query.bloques === undefined ? undefined : query.bloques === 'true',
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="utilisateurs-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  };
}
