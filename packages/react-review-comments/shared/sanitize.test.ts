import { describe, expect, it } from 'vitest';
import { sanitizeAnchorSelector, sanitizeUuidParam } from './sanitize';

describe('sanitizeUuidParam', () => {
  it('accepts RFC 4122 UUIDs and lowercases', () => {
    expect(sanitizeUuidParam('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('rejects non-UUID strings', () => {
    expect(sanitizeUuidParam('not-a-uuid')).toBe('');
    expect(sanitizeUuidParam('{"$gt":""}')).toBe('');
    expect(sanitizeUuidParam('')).toBe('');
  });
});

describe('sanitizeAnchorSelector', () => {
  it('drops Mongo-style keys and prototype pollution keys', () => {
    const out = sanitizeAnchorSelector({
      $where: '1',
      __proto__: { polluted: true },
      safeKey: 'hello',
    });
    expect(out).toEqual({ safeKey: 'hello' });
  });

  it('allows nested plain objects with safe keys only', () => {
    const out = sanitizeAnchorSelector({
      outer: { inner: 'x' },
    });
    expect(out).toEqual({ outer: { inner: 'x' } });
  });

  it('returns empty object for arrays and non-objects', () => {
    expect(sanitizeAnchorSelector([])).toEqual({});
    expect(sanitizeAnchorSelector('x')).toEqual({});
    expect(sanitizeAnchorSelector(null)).toEqual({});
  });
});
