import type { Request, Response, NextFunction } from 'express';
import { PayoutBatchService } from './payout-batch.service.js';
import {
  payoutBatchCancelSchema,
  payoutBatchConfirmSchema,
  payoutBatchEligibleQuerySchema,
  payoutBatchIdParamsSchema,
  payoutBatchListQuerySchema,
  payoutBatchPrepareSchema,
} from './payout-batch.schema.js';

export class PayoutBatchController {
  constructor(private readonly service: PayoutBatchService) {}

  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = payoutBatchListQuerySchema.parse(req.query);
      const result = await this.service.listForAdmin(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listEligibles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = payoutBatchEligibleQuerySchema.parse(req.query);
      const result = await this.service.listEligibleGrouped(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutBatchIdParamsSchema.parse(req.params);
      const batch = await this.service.getForAdmin(id);
      res.status(200).json({ success: true, batch });
    } catch (error) {
      next(error);
    }
  };

  prepare = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = payoutBatchPrepareSchema.parse(req.body);
      const result = await this.service.prepareBatch(data, req.user!.id);
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutBatchIdParamsSchema.parse(req.params);
      const data = payoutBatchConfirmSchema.parse(req.body);
      const result = await this.service.confirmBatch(id, data, req.user!.id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = payoutBatchIdParamsSchema.parse(req.params);
      const data = payoutBatchCancelSchema.parse(req.body);
      const result = await this.service.cancelBatch(id, data.motifAnnulation, req.user!.id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
