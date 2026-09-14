import type { NextFunction, Request, Response } from 'express';
import { BuyerSettingsService } from './buyer-settings.service.js';
import { updateParametresSchema } from './buyer-settings.schema.js';

export class BuyerSettingsController {
  constructor(private readonly service: BuyerSettingsService) {}

  getParametres = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parametres = await this.service.getParametres(req.user!.id);
      res.status(200).json({ success: true, parametres });
    } catch (error) {
      next(error);
    }
  };

  updateParametres = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = updateParametresSchema.parse(req.body);
      const parametres = await this.service.updateParametres(req.user!.id, input);
      res.status(200).json({ success: true, message: 'Paramètres mis à jour', parametres });
    } catch (error) {
      next(error);
    }
  };
}