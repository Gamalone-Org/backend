import type {
  ArtisanProfile,
  ArtisanAtelierPhoto,
  CreationProcessus,
  Exposition,
  ArtisanPaymentPreference,
  User,
} from '../../generated/prisma/client.js';

export type ArtisanProfileWithUser = ArtisanProfile & {
  user: Pick<User, 'id' | 'email' | 'nom' | 'telephone'>;
};

export type ArtisanFullProfile = ArtisanProfileWithUser & {
  atelierPhotos: ArtisanAtelierPhoto[];
  processusEtapes: CreationProcessus[];
  expositions: Exposition[];
  paiementPreference: ArtisanPaymentPreference | null;
};

export const MAX_ATELIER_PHOTOS = 3;
export const MAX_PROCESSUS_ETAPES = 4;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
