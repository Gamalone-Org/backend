import type {
  ArtisanType,
  ArtworkStatus,
  KycStatus,
  OrderStatus,
  UserStatus,
} from '../../../generated/prisma/client.js';

export type AdminArtisanListItem = {
  id: string;
  userId: string;
  nom: string | null;
  nomAtelier: string;
  avatar: string | null;
  specialty: string;
  location: string;
  inscription: string;
  accountStatus: UserStatus;
  kycStatus: KycStatus | null;
  kycId: string | null;
  artworksCount: number;
  grossOrderVolume: number;
};

export type AdminArtisanListResult = {
  items: AdminArtisanListItem[];
  total: number;
  page: number;
  limit: number;
};

export type AdminArtisanDetail = {
  profil: {
    userId: string;
    nom: string | null;
    email: string | null;
    telephone: string;
    accountStatus: UserStatus;
    inscription: string;
  };
  artisan: {
    id: string;
    type: ArtisanType;
    nomAtelier: string;
    specialite: string;
    biographie: string;
    localisation: string;
    anneesExperience: number;
    estCertifie: boolean;
    scoreFiabilite: number | null;
    photoAtelierUrl: string | null;
    validatedAt: Date | null;
    createdAt: Date;
  };
  kyc: {
    id: string;
    status: KycStatus;
    submittedAt: Date | null;
    reviewedAt: Date | null;
  } | null;
  statistiques: {
    totalOeuvres: number;
    publiees: number;
    enPanier: number;
    vendues: number;
    nbCommandesArtisan: number;
    grossOrderVolume: number;
  };
};

export type AdminArtisanArtwork = {
  id: string;
  titre: string;
  statut: ArtworkStatus;
  prixXOF: number;
  createdAt: Date;
  coverUrl: string | null;
};

export type AdminArtisanOrder = {
  id: string;
  statut: OrderStatus;
  sousTotal: number;
  commission: number;
  fraisLivraison: number;
  montantTotal: number;
  createdAt: Date;
  commande: {
    id: string;
    statut: OrderStatus;
    dateCreation: Date;
    createdAt: Date;
    acheteur: {
      id: string;
      typeClient: string;
      nom: string | null;
    };
  } | null;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};