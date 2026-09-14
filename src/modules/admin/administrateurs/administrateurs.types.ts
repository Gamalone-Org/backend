import type {
  AdminAccessLevel,
  AdminPermission,
  Prisma,
  UserStatus,
} from '../../../generated/prisma/client.js';

export type AdminProfilePermissionRow = { permission: AdminPermission };

export type AdminProfileWithPermissions = {
  id: string;
  niveauAcces: AdminAccessLevel;
  departement: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: AdminProfilePermissionRow[];
};

export type AdminUserListItem = {
  id: string;
  email: string | null;
  nom: string | null;
  telephone: string;
  statut: UserStatus;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  telephoneVerificationStatus: string;
  adminProfile: AdminProfileWithPermissions | null;
};

export type AdminUserDetail = {
  id: string;
  email: string | null;
  nom: string | null;
  telephone: string;
  statut: UserStatus;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  telephoneVerificationStatus: string;
  telephoneVerifiedAt: Date | null;
  adminProfile: AdminProfileWithPermissions | null;
};

export type CreateAdminTransactionResult = {
  userId: string;
  adminProfileId: string;
};

export type ListAdministrateursOptions = {
  page: number;
  limit: number;
  q?: string;
  statut?: UserStatus;
  niveauAcces?: AdminAccessLevel;
};

export type Actor = {
  id: string;
  role: string;
  adminAccessLevel?: AdminAccessLevel | null;
  adminProfileId?: string | null;
};

export type AuditDetails = Prisma.InputJsonValue | undefined;
