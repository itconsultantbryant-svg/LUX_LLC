import { z } from 'zod';

export const RoleCodeSchema = z.enum([
  'customer',
  'contributor',
  'provider_staff',
  'provider_manager',
  'organization_admin',
  'program_manager',
  'finance_operator',
  'partner_officer',
  'provider_admin',
  'employer_admin',
  'sponsor_admin',
  'reviewer',
  'platform_admin',
  'partner_readonly',
  'system',
]);

export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const ROLE_LABELS: Record<RoleCode, string> = {
  customer: 'Customer / caregiver',
  contributor: 'Family / diaspora contributor',
  provider_staff: 'Healthcare provider staff',
  provider_manager: 'ProviderManager',
  organization_admin: 'OrganizationAdmin',
  program_manager: 'ProgramManager',
  finance_operator: 'FinanceOperator',
  partner_officer: 'PartnerOfficer',
  provider_admin: 'Healthcare provider admin',
  employer_admin: 'Employer / organization admin',
  sponsor_admin: 'NGO / charity / program sponsor',
  reviewer: 'Authorized reviewer',
  platform_admin: 'Platform administrator',
  partner_readonly: 'Financial / insurance partner (read)',
  system: 'System / job runner',
};
