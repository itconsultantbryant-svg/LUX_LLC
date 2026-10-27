import { describe, expect, it } from 'vitest';
import { hasAnyRole, hasInstitutionalRole } from './roles';

describe('role access helpers', () => {
  it('does not treat the shared customer role as institutional access', () => {
    expect(hasInstitutionalRole(['customer'])).toBe(false);
  });

  it('allows only the required institutional role', () => {
    expect(hasAnyRole(['customer', 'employer_admin'], ['employer_admin'])).toBe(true);
    expect(hasAnyRole(['customer', 'employer_admin'], ['provider_admin'])).toBe(false);
  });
});
