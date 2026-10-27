export const institutionalRoles = [
  'platform_admin',
  'reviewer',
  'provider_admin',
  'provider_manager',
  'provider_staff',
  'employer_admin',
  'sponsor_admin',
  'partner_officer',
] as const;

export type InstitutionalRole = (typeof institutionalRoles)[number];

export function hasAnyRole(
  roles: readonly string[] | undefined,
  allowedRoles: readonly string[],
): boolean {
  return Boolean(roles?.some((role) => allowedRoles.includes(role)));
}

export function hasInstitutionalRole(roles: readonly string[] | undefined): boolean {
  return hasAnyRole(roles, institutionalRoles);
}
