import type {
  ArtworkStatus,
  KycStatus,
  OrderStatus,
  UserRole,
} from '../../../generated/prisma/client.js';

export type DashboardPeriodKey = '7d' | '30d' | '90d' | '12m';

export type PeriodBounds = {
  key: DashboardPeriodKey;
  from: Date;
  to: Date;
};

export type DashboardUsers = {
  total: number;
  buyers: number;
  artisans: number;
  newUsers: number;
  newBuyers: number;
  newArtisans: number;
};

export type DashboardKyc = {
  pending: number;
  approved: number;
  rejected: number;
};

export type DashboardArtworks = {
  total: number;
  published: number;
  pending: number;
  reserved: number;
  withdrawn: number;
  sold: number;
  newArtworks: number;
};

export type DashboardOrders = {
  total: number;
  inPeriod: number;
  byStatus: Record<OrderStatus, number>;
};

export type DashboardRevenue = {
  grossOrderVolume: number;
};

export type EvolutionPoint = {
  date: string;
  orders: number;
  volume: number;
};

export type RecentOrder = {
  id: string;
  dateCreation: Date;
  statut: OrderStatus;
  montantTotal: number;
  createdAt: Date;
  acheteur: {
    id: string;
    typeClient: string;
    user: {
      id: string;
      nom: string | null;
      telephone: string;
    };
  };
};

export type DashboardResult = {
  period: {
    key: DashboardPeriodKey;
    from: string;
    to: string;
  };
  users: DashboardUsers;
  kyc: DashboardKyc;
  artworks: DashboardArtworks;
  orders: DashboardOrders;
  revenue: DashboardRevenue;
  evolution: EvolutionPoint[];
  recentOrders: RecentOrder[];
};

export type RoleCount = {
  role: UserRole;
  _count: { _all: number };
};

export type KycStatusCount = {
  status: KycStatus;
  _count: { _all: number };
};

export type ArtworkStatusCount = {
  statut: ArtworkStatus;
  _count: { _all: number };
};

export type OrderStatusCount = {
  statut: OrderStatus;
  _count: { _all: number };
};

export type EvolutionRow = {
  day: string;
  orders: number;
  volume: number;
};