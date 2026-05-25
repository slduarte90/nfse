import { UserRole } from '@prisma/client';

export const COMPANY_PERMISSION_KEYS = [
  'nfse.invoices.view',
  'nfse.invoices.create',
  'nfse.invoices.edit',
  'nfse.invoices.delete',
  'nfse.invoices.transmit',
  'nfse.invoices.sync',
  'nfse.takers.view',
  'nfse.takers.create',
  'nfse.takers.edit',
  'nfse.takers.delete',
  'nfse.settings.view',
  'nfse.settings.edit',
  'accounting.documents.view',
  'accounting.taxes.view',
  'accounting.requests.view',
  'accounting.processes.view',
] as const;

export type CompanyPermissionKey = (typeof COMPANY_PERMISSION_KEYS)[number];

const permissionSet = new Set<string>(COMPANY_PERMISSION_KEYS);

const VIEW_ONLY_PERMISSIONS: CompanyPermissionKey[] = [
  'nfse.invoices.view',
  'nfse.takers.view',
  'nfse.settings.view',
  'accounting.documents.view',
  'accounting.taxes.view',
  'accounting.requests.view',
  'accounting.processes.view',
];

const OPERATOR_PERMISSIONS: CompanyPermissionKey[] = COMPANY_PERMISSION_KEYS.filter((permission) => (
  !permission.startsWith('accounting.') || permission.endsWith('.view')
));

export function sanitizeCompanyPermissions(input: unknown): CompanyPermissionKey[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((item) => String(item)).filter((item): item is CompanyPermissionKey => permissionSet.has(item))));
}

export function defaultCompanyPermissionsForRole(role: UserRole): CompanyPermissionKey[] {
  if (role === UserRole.VIEWER) return VIEW_ONLY_PERMISSIONS;
  if (role === UserRole.OPERATOR) return OPERATOR_PERMISSIONS;
  return [...COMPANY_PERMISSION_KEYS];
}

export function resolveCompanyPermissions(role: UserRole, stored: unknown): CompanyPermissionKey[] {
  if (Array.isArray(stored)) return sanitizeCompanyPermissions(stored);
  return defaultCompanyPermissionsForRole(role);
}

export function hasCompanyPermission(role: UserRole, stored: unknown, permission: CompanyPermissionKey) {
  return resolveCompanyPermissions(role, stored).includes(permission);
}

export function hasAnyCompanyPermission(role: UserRole, stored: unknown, permissions: CompanyPermissionKey[]) {
  const resolved = resolveCompanyPermissions(role, stored);
  return permissions.some((permission) => resolved.includes(permission));
}
