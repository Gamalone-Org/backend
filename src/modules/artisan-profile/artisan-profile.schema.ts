import { z } from 'zod';

const uuidParam = z.string().uuid('Invalid id');

// ---------------------------------------------------------------------------
// Profil principal
// ---------------------------------------------------------------------------

export const updateProfilSchema = z
  .object({
    nomAtelier: z.string().trim().min(1).max(255).optional(),
    specialite: z.string().trim().min(1).max(255).optional(),
    anneeCreation: z
      .number()
      .int()
      .min(1900, 'Année invalide')
      .max(new Date().getFullYear() + 1, 'Année invalide')
      .optional(),
    ville: z.string().trim().min(1).max(255).optional(),
    pays: z.string().trim().min(1).max(255).optional(),
    bioCourte: z.string().trim().max(500).optional(),
    histoire: z.string().trim().max(10000).optional(),
    siteWeb: z.string().trim().url('URL invalide').max(500).optional(),
    instagram: z.string().trim().max(255).optional(),
    facebook: z.string().trim().max(255).optional(),
    whatsapp: z.string().trim().max(255).optional(),
    devise: z.enum(['XOF', 'EUR', 'USD']).optional(),
    langue: z.enum(['fr', 'en']).optional(),
    preparationMinDays: z.number().int().min(0).max(365).optional(),
    preparationMaxDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni',
  })
  .refine(
    (data) => {
      if (data.preparationMinDays !== undefined && data.preparationMaxDays !== undefined) {
        return data.preparationMaxDays >= data.preparationMinDays;
      }
      return true;
    },
    {
      message: 'Le délai maximum doit être supérieur ou égal au délai minimum',
      path: ['preparationMaxDays'],
    }
  );

// ---------------------------------------------------------------------------
// Versements
// ---------------------------------------------------------------------------

export const updateVersementSchema = z
  .object({
    methode: z.enum(['MOBILE_MONEY', 'VIREMENT_BANCAIRE']),
    mobileMoneyOperateur: z.string().trim().max(100).optional(),
    mobileMoneyNumero: z.string().trim().max(30).optional(),
    virementNomBanque: z.string().trim().max(255).optional(),
    virementIban: z.string().trim().max(50).optional(),
    virementNomCompte: z.string().trim().max(255).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.methode === 'MOBILE_MONEY') {
        return !!data.mobileMoneyOperateur && !!data.mobileMoneyNumero;
      }
      if (data.methode === 'VIREMENT_BANCAIRE') {
        return !!data.virementNomBanque;
      }
      return true;
    },
    {
      message: 'Champs requis manquants pour la méthode de versement sélectionnée',
    }
  );

// ---------------------------------------------------------------------------
// Photos atelier
// ---------------------------------------------------------------------------

export const atelierPhotoParamsSchema = z.object({
  photoId: uuidParam,
});

export const reorderAtelierPhotosSchema = z
  .object({
    photoIds: z
      .array(uuidParam)
      .min(1, 'Au moins une photo est requise')
      .max(3, 'Maximum 3 photos'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Processus de création
// ---------------------------------------------------------------------------

export const createProcessusSchema = z
  .object({
    ordre: z.number().int().min(1).max(4),
    legende: z.string().trim().min(1).max(500),
  })
  .strict();

export const updateProcessusSchema = z
  .object({
    legende: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni',
  });

export const processusParamsSchema = z.object({
  etapeId: uuidParam,
});

export const reorderProcessusSchema = z
  .object({
    etapeIds: z
      .array(uuidParam)
      .min(1, 'Au moins une étape est requise')
      .max(4, 'Maximum 4 étapes'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Expositions
// ---------------------------------------------------------------------------

export const createExpositionSchema = z
  .object({
    annee: z
      .number()
      .int()
      .min(1900, 'Année invalide')
      .max(new Date().getFullYear() + 5, 'Année invalide'),
    evenement: z.string().trim().min(1).max(255),
    lieu: z.string().trim().min(1).max(255),
  })
  .strict();

export const updateExpositionSchema = z
  .object({
    annee: z
      .number()
      .int()
      .min(1900, 'Année invalide')
      .max(new Date().getFullYear() + 5, 'Année invalide')
      .optional(),
    evenement: z.string().trim().min(1).max(255).optional(),
    lieu: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni',
  });

export const expositionParamsSchema = z.object({
  expositionId: uuidParam,
});
