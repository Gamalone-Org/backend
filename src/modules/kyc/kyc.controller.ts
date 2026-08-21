import type { NextFunction, Request, Response } from 'express';
import {
  adminKycListQuerySchema,
  adminKycReviewReasonSchema,
  kycDocumentParamsSchema,
  kycIdParamsSchema,
  submitKycSchema,
  uploadKycDocumentSchema,
} from './kyc.schema.js';
import { KycService } from './kyc.service.js';

export class KycController {
  constructor(private readonly service: KycService) {}

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = submitKycSchema.parse(req.body);
      const userId = req.user?.id;
      const kyc = await this.service.submit(userId ?? '', input);
      res.status(201).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  resubmit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = submitKycSchema.parse(req.body);
      const userId = req.user?.id;
      const kyc = await this.service.resubmit(userId ?? '', input);
      res.status(201).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  getMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const kyc = await this.service.getMyKyc(req.user?.id ?? '');
      res.status(200).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const kyc = await this.service.getById(id, actor);
      res.status(200).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { documentType } = uploadKycDocumentSchema.parse(req.body);
      const actorId = req.user?.id ?? '';
      const document = await this.service.uploadDocument(id, actorId, documentType, req.file);
      res.status(201).json({ success: true, document });
    } catch (error) {
      next(error);
    }
  };

  getDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const documents = await this.service.getDocuments(id, actor);
      res.status(200).json({ success: true, documents });
    } catch (error) {
      next(error);
    }
  };

  deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, documentId } = kycDocumentParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const result = await this.service.deleteDocument(id, documentId, actor);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listPendingReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminKycListQuerySchema.parse(req.query);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const result = await this.service.listPendingReviews(actor, query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdminDetailsById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const kyc = await this.service.getAdminDetailsById(id, actor);
      res.status(200).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  getReviewHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const history = await this.service.getReviewHistory(id, actor);
      res.status(200).json({ success: true, history });
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const kyc = await this.service.approveKyc(id, actor);
      res.status(200).json({ success: true, message: 'KYC approved successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { reason } = adminKycReviewReasonSchema.parse(req.body);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const kyc = await this.service.rejectKyc(id, actor, reason);
      res.status(200).json({ success: true, message: 'KYC rejected successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  requestCorrection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { reason } = adminKycReviewReasonSchema.parse(req.body);
      const actor = {
        id: req.user?.id ?? '',
        role: req.user?.role ?? '',
      };
      const kyc = await this.service.requestKycCorrection(id, actor, reason);
      res.status(200).json({ success: true, message: 'Correction requested successfully', kyc });
    } catch (error) {
      next(error);
    }
  };
}



