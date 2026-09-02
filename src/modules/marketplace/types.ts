import type { ArtworkStatus, MediaType } from '../../generated/prisma/client.js';

export const MAX_OEUVRE_MEDIAS = 7;
export const MAX_PREPARATION_MEDIAS = 3;
export const MAX_PHOTO_ATELIER = 1;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const CLOUDINARY_ARTWORKS_DOMAIN = 'artworks' as const;

export const MEDIA_TYPE_LIMITS: Record<Extract<MediaType, 'OEUVRE' | 'PREPARATION'>, number> = {
  OEUVRE: MAX_OEUVRE_MEDIAS,
  PREPARATION: MAX_PREPARATION_MEDIAS,
};

export const VALID_STATUS_TRANSITIONS: Record<ArtworkStatus, ArtworkStatus[]> = {
  BROUILLON: ['EN_ATTENTE_VALIDATION', 'PUBLIEE'],
  EN_ATTENTE_VALIDATION: ['BROUILLON', 'PUBLIEE'],
  PUBLIEE: ['RETIREE', 'VENDUE'],
  VENDUE: [],
  RETIREE: [],
};

export type PublicOeuvreSelect = {
  id: true;
  titre: true;
  description: true;
  technique: true;
  materiaux: true;
  dimensions: true;
  poids: true;
  anneeCreation: true;
  prixXOF: true;
  statut: true;
  estMiseEnAvant: true;
  createdAt: true;
  updatedAt: true;
  artisan: {
    select: {
      id: true;
      type: true;
      nomAtelier: true;
      specialite: true;
      localisation: true;
      estCertifie: true;
      photoAtelierUrl: true;
      user: {
        select: {
          id: true;
          nom: true;
        };
      };
    };
  };
  categorie: {
    select: {
      id: true;
      nom: true;
      description: true;
    };
  };
  medias: {
    orderBy: { ordre: 'asc' };
    select: {
      id: true;
      url: true;
      mimeType: true;
      type: true;
      width: true;
      height: true;
      ordre: true;
    };
  };
  certificat: {
    select: {
      id: true;
      codeQR: true;
      dateEmission: true;
      estValide: true;
    };
  };
};

export type AdminOeuvreSelect = PublicOeuvreSelect & {
  rejectionReason: true;
  publishedByAdminId: true;
  artisan: PublicOeuvreSelect['artisan'] & {
    user: {
      select: {
        id: true;
        nom: true;
        telephone: true;
      };
    };
  };
};
