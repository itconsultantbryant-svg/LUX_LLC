import { describe, expect, it } from 'vitest';
import { isDemoLike, normalizeApiBaseUrl } from './config';

describe('isDemoLike', () => {
  it('treats development and demo as simulation environments', () => {
    expect(isDemoLike('development')).toBe(true);
    expect(isDemoLike('demo')).toBe(true);
    expect(isDemoLike('production')).toBe(false);
  });
});

describe('normalizeApiBaseUrl', () => {
  it('keeps an empty or missing base as same-origin', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('');
    expect(normalizeApiBaseUrl('')).toBe('');
    expect(normalizeApiBaseUrl('   ')).toBe('');
  });

  it('keeps an origin-only base unchanged', () => {
    expect(normalizeApiBaseUrl('https://luxllc.vercel.app')).toBe('https://luxllc.vercel.app');
  });

  it('strips a trailing /api so /api paths are not doubled', () => {
    expect(normalizeApiBaseUrl('https://luxllc.vercel.app/api')).toBe('https://luxllc.vercel.app');
    expect(normalizeApiBaseUrl('https://luxllc.vercel.app/api/')).toBe('https://luxllc.vercel.app');
    expect(normalizeApiBaseUrl('/api')).toBe('');
    expect(normalizeApiBaseUrl('/api/')).toBe('');
  });
});
