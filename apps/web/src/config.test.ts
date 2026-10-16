import { describe, expect, it } from 'vitest';
import { isDemoLike } from './config';

describe('isDemoLike', () => {
  it('treats development and demo as simulation environments', () => {
    expect(isDemoLike('development')).toBe(true);
    expect(isDemoLike('demo')).toBe(true);
    expect(isDemoLike('production')).toBe(false);
  });
});
