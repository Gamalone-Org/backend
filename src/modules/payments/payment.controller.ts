import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/AppError.js';
import { PaymentService } from './payment.service.js';
import { paymentAdminIdParamsSchema, paymentAdminQuerySchema } from './payment.schema.js';
import { env } from '../../config/env.js';

const orderIdSchema = z.string().uuid();

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  initializeOrderPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const commandeId = orderIdSchema.parse(req.params['id']);
      const result = await this.paymentService.initializeOrderPayment(commandeId, req.user!.id);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Endpoint public de réception IPN PayDunya (application/x-www-form-urlencoded).
   * Le hash data.hash est vérifié selon la clé principale, puis le statut est
   * confirmé via l'API PayDunya avant toute transition métier.
   */
  handlePayDunyaIpn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== 'object') {
        throw new AppError(400, 'Corps IPN PayDunya invalide.', 'PAYDUNYA_INVALID_BODY');
      }

      const masterKey = env.PAYDUNYA_MASTER_KEY;
      if (!masterKey) {
        throw new AppError(
          500,
          "PayDunya n'est pas configuré (clé principale manquante).",
          'PAYDUNYA_NOT_CONFIGURED'
        );
      }

      const data = (body['data'] as Record<string, unknown>) || body;
      const receivedHash = (data['hash'] || body['hash']) as string | undefined;
      if (typeof receivedHash !== 'string' || receivedHash.length === 0) {
        throw new AppError(400, 'Hash IPN PayDunya manquant.', 'PAYDUNYA_MISSING_HASH');
      }

      const expectedHash = createHash('sha512').update(masterKey).digest('hex');
      if (receivedHash.toLowerCase() !== expectedHash.toLowerCase()) {
        throw new AppError(400, 'Hash IPN PayDunya invalide.', 'PAYDUNYA_INVALID_HASH');
      }

      const token =
        (data['token'] as string) ||
        (data['invoice_token'] as string) ||
        (body['token'] as string) ||
        (body['invoice_token'] as string);
      const status = (data['status'] as string) || (body['status'] as string);

      if (!token) {
        throw new AppError(400, 'Token facture PayDunya manquant.', 'PAYDUNYA_MISSING_TOKEN');
      }

      const result = await this.paymentService.handlePayDunyaIpn({
        token,
        status,
        payload: body,
      });
      res.status(200).json({ success: true, statut: result.statut });
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = paymentAdminQuerySchema.parse(req.query);
      const result = await this.paymentService.listForAdmin(query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = paymentAdminIdParamsSchema.parse(req.params);
      const paiement = await this.paymentService.getForAdmin(id);
      res.status(200).json({ success: true, paiement });
    } catch (error) {
      next(error);
    }
  };
}
