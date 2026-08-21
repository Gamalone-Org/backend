import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const submitKycSchema = z.object({
  identityData: jsonObjectSchema,
  professionData: jsonObjectSchema.optional(),
  additionalInfo: jsonObjectSchema.optional(),
  addressData: jsonObjectSchema,
  identityDocument: jsonObjectSchema,
  supportingDocs: jsonObjectSchema.optional(),
}).strict();

export const kycIdParamsSchema = z.object({
  id: z.uuid(),
}).strict();

export const kycDocumentParamsSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
}).strict();

export const kycDocumentTypeValues = [
  'CNI_RECTO',
  'CNI_VERSO',
  'PASSEPORT',
  'TITRE_SEJOUR',
  'JUSTIFICATIF_DOMICILE',
  'PHOTO_SELFIE',
  'EXTRAIT_KBIS',
  'DOCUMENT_COMPLEMENTAIRE',
] as const;

export const uploadKycDocumentSchema = z.object({
  documentType: z.enum(kycDocumentTypeValues, {
    message: 'Invalid or missing documentType',
  }),
}).strict();

export const kycStatusValues = [
  'BROUILLON',
  'SOUMIS',
  'EN_ATTENTE',
  'VALIDE',
  'REJETE',
  'CORRECTION_REQUISE',
  'EXPIRE',
] as const;

export const adminKycListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(kycStatusValues).optional(),
}).strict();

export const adminKycReviewReasonSchema = z.object({
  reason: z.string().trim().min(1, 'Reason cannot be empty'),
}).strict();

export type SubmitKycSchemaInput = z.infer<typeof submitKycSchema>;
export type UploadKycDocumentSchemaInput = z.infer<typeof uploadKycDocumentSchema>;
export type AdminKycListQuerySchemaInput = z.infer<typeof adminKycListQuerySchema>;
export type AdminKycReviewReasonSchemaInput = z.infer<typeof adminKycReviewReasonSchema>;


