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
  'nfse.settings.delete',
  'accounting.documents.view',
  'accounting.documents.edit',
  'accounting.documents.delete',
  'accounting.taxes.view',
  'accounting.taxes.edit',
  'accounting.taxes.delete',
  'accounting.requests.view',
  'accounting.requests.edit',
  'accounting.requests.delete',
  'accounting.processes.view',
  'accounting.processes.edit',
  'accounting.processes.delete',
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

const OPERATOR_PERMISSIONS: CompanyPermissionKey[] = [
  'nfse.invoices.view',
  'nfse.invoices.create',
  'nfse.invoices.edit',
  'nfse.invoices.transmit',
  'nfse.invoices.sync',
  'nfse.takers.view',
  'nfse.takers.create',
  'nfse.takers.edit',
  'nfse.settings.view',
  'nfse.settings.edit',
  'accounting.documents.view',
  'accounting.taxes.view',
  'accounting.requests.view',
  'accounting.processes.view',
];

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
