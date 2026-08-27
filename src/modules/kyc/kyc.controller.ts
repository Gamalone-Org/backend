import type { NextFunction, Request, Response } from 'express';
import {
  adminKycListQuerySchema,
  adminKycReviewReasonSchema,
  kycAnonymizeSchema,
  kycDocumentParamsSchema,
  kycIdParamsSchema,
  kycLegalHoldSchema,
  submitKycSchema,
  uploadKycDocumentSchema,
} from './kyc.schema.js';
import { KycService } from './kyc.service.js';
import type { KycActor } from './kyc.types.js';

export class KycController {
  constructor(private readonly service: KycService) {}

  private getActor(req: Request): KycActor {
    return {
      id: req.user?.id ?? '',
      role: req.user?.role ?? '',
      adminProfileId: req.user?.adminProfileId ?? null,
      adminAccessLevel: req.user?.adminAccessLevel ?? null,
    };
  }

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = submitKycSchema.parse(req.body);
      const kyc = await this.service.submit(req.user?.id ?? '', input);
      res.status(201).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  resubmit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = submitKycSchema.parse(req.body);
      const kyc = await this.service.resubmit(req.user?.id ?? '', input);
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
      const kyc = await this.service.getById(id, this.getActor(req));
      res.status(200).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  uploadDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { documentType } = uploadKycDocumentSchema.parse(req.body);
      const document = await this.service.uploadDocument(id, req.user?.id ?? '', documentType, req.file);
      res.status(201).json({ success: true, document });
    } catch (error) {
      next(error);
    }
  };

  getDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const documents = await this.service.getDocuments(id, this.getActor(req));
      res.status(200).json({ success: true, documents });
    } catch (error) {
      next(error);
    }
  };

  deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, documentId } = kycDocumentParamsSchema.parse(req.params);
      const result = await this.service.deleteDocument(id, documentId, this.getActor(req));
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  listPendingReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = adminKycListQuerySchema.parse(req.query);
      const result = await this.service.listPendingReviews(this.getActor(req), query);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  getAdminDetailsById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const kyc = await this.service.getAdminDetailsById(id, this.getActor(req));
      res.status(200).json({ success: true, kyc });
    } catch (error) {
      next(error);
    }
  };

  getReviewHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const history = await this.service.getReviewHistory(id, this.getActor(req));
      res.status(200).json({ success: true, history });
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const kyc = await this.service.approveKyc(id, this.getActor(req));
      res.status(200).json({ success: true, message: 'KYC approved successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { reason } = adminKycReviewReasonSchema.parse(req.body);
      const kyc = await this.service.rejectKyc(id, this.getActor(req), reason);
      res.status(200).json({ success: true, message: 'KYC rejected successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  requestCorrection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { reason } = adminKycReviewReasonSchema.parse(req.body);
      const kyc = await this.service.requestKycCorrection(id, this.getActor(req), reason);
      res.status(200).json({ success: true, message: 'Correction requested successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  setLegalHold = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { legalHold } = kycLegalHoldSchema.parse(req.body);
      const kyc = await this.service.setLegalHold(id, this.getActor(req), legalHold);
      res.status(200).json({ success: true, message: 'Legal hold updated successfully', kyc });
    } catch (error) {
      next(error);
    }
  };

  anonymize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = kycIdParamsSchema.parse(req.params);
      const { force } = kycAnonymizeSchema.parse(req.body ?? {});
      const result = await this.service.anonymizeKyc(id, this.getActor(req), force);
      res.status(200).json({ success: true, message: 'KYC anonymization processed', result });
    } catch (error) {
      next(error);
    }
  };

  runPurge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.runPurge(this.getActor(req));
      res.status(200).json({ success: true, message: 'KYC purge completed', result });
    } catch (error) {
      next(error);
    }
  };
}
