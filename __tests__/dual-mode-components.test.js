/**
 * Tests for MDX ButtonEmbed link resolution (href primary, legacy url fallback).
 */
import { describe, it, expect } from 'vitest';

function resolveButtonHref({ href, url }) {
  const raw = (typeof href === 'string' ? href : null) ?? (typeof url === 'string' ? url : null);
  return raw || '#';
}

describe('ButtonEmbed href (string URLs only)', () => {
  it('returns plain string URL as-is', () => {
    expect(resolveButtonHref({ href: 'https://example.com' })).toBe('https://example.com');
  });

  it('returns internal path as-is', () => {
    expect(resolveButtonHref({ href: '/guides/protest/' })).toBe('/guides/protest/');
  });

  it('falls back to legacy url', () => {
    expect(resolveButtonHref({ url: '/legacy/' })).toBe('/legacy/');
  });

  it('returns # for empty string', () => {
    expect(resolveButtonHref({ href: '' })).toBe('#');
  });

  it('returns # when href/url missing or not a string', () => {
    expect(resolveButtonHref({})).toBe('#');
    expect(resolveButtonHref({ href: undefined, url: undefined })).toBe('#');
  });
});
