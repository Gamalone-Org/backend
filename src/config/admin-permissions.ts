/**
 * Configuration du système de permissions des administrateurs.
 *
 * Hiérarchie d'accès :
 * - SUPER_ADMIN : accès implicite total (OPTION A). Un SUPER_ADMIN passe
 *   toujours le middleware `requirePermission(...)` sans vérification de
 *   permissions stockées : il les possède toutes par nature.
 * - SUPPORT / MODERATEUR (les "ADMIN" de l'architecture) : accès conditionné
 *   aux permissions explicitement attribuées dans `admin_profile_permissions`.
 *
 * Les permissions ADMINS_* (gestion des comptes administrateurs) sont des
 * permissions privilégiées : elles ne doivent JAMAIS être attribuées à un
 * compte qui n'est pas SUPER_ADMIN, et un ADMIN simple ne peut pas les
 * exercer, même par inadvertance. Cette règle est défendue dans le middleware
 * `requirePermission` ET dans le service de gestion des administrateurs
 * (défense en profondeur anti-escalade).
 */

export const ADMIN_MANAGEMENT_PERMISSIONS = [
  'ADMINS_READ',
  'ADMINS_CREATE',
  'ADMINS_UPDATE',
  'ADMINS_MANAGE',
] as const;

export const PRIVILEGED_ADMIN_PERMISSIONS: ReadonlySet<string> = new Set<string>(
  ADMIN_MANAGEMENT_PERMISSIONS
);

export function isAdminManagementPermission(permission: string): boolean {
  return PRIVILEGED_ADMIN_PERMISSIONS.has(permission);
}

/**
 * Une permission qui ne peut jamais être exercée ni attribuée à autre chose
 * qu'un compte SUPER_ADMIN actif.
 */
export function isPrivilegedPermission(permission: string): boolean {
  return isAdminManagementPermission(permission);
}
