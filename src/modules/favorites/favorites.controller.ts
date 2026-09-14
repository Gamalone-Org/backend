import type { NextFunction, Request, Response } from 'express';
import { FavoriteService } from './favorites.service.js';
import { favoritesQuerySchema, favoriParamsSchema } from './favorites.schema.js';

export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = favoritesQuerySchema.parse(req.query);
      const result = await this.favoriteService.getMyFavorites(
        req.user!.id,
        query.page,
        query.limit
      );
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { oeuvreId } = favoriParamsSchema.parse(req.params);
      const favori = await this.favoriteService.addFavorite(req.user!.id, oeuvreId);
      res.status(201).json({ success: true, message: 'Œuvre ajoutée aux favoris', favori });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { oeuvreId } = favoriParamsSchema.parse(req.params);
      await this.favoriteService.removeFavorite(req.user!.id, oeuvreId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}