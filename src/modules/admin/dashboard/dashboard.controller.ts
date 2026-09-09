import type { NextFunction, Request, Response } from 'express';
import { dashboardQuerySchema } from './dashboard.schema.js';
import { DashboardService } from './dashboard.service.js';

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = dashboardQuerySchema.parse(req.query);
      const dashboard = await this.service.getDashboard(query.period);
      res.status(200).json({ success: true, ...dashboard });
    } catch (error) {
      next(error);
    }
  };
}