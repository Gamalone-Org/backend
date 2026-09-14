import { z } from 'zod';

export const langueEnum = z.enum(['fr', 'en']);

export const deviseEnum = z.enum(['XOF', 'EUR', 'USD']);

// Préférences de notification : canaux cohérents avec l'infrastructure du
// projet (SMS réel via AfrikSMS, email/push à venir). Ces préférences n'ont
// AUCUN effet d'envoi, elles indiquent seulement les canaux souhaités.
export const notificationsSchema = z
  .object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    push: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins une préférence de notification doit être fournie',
  });

export const updateParametresSchema = z
  .object({
    langue: langueEnum.optional(),
    devise: deviseEnum.optional(),
    notifications: notificationsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni',
  });