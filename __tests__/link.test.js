import { describe, it, expect } from 'vitest';
import {
  defaultExternalTarget,
  isExternalHref,
  resolveLocaleAwareHref,
} from '../lib/locale-aware-href';

/**
 * Regression tests for locale-aware routing (components/Link.js, ButtonEmbed).
 * Logic lives in lib/locale-aware-href.js so classification stays consistent with
 * next-intl internal links vs plain anchor for externals.
 */
describe('locale-aware href helpers (Link)', () => {
  describe('isExternalHref', () => {
    it('treats http(s) and protocol-relative URLs as external', () => {
      expect(isExternalHref('https://example.com')).toBe(true);
      expect(isExternalHref('http://example.com')).toBe(true);
      expect(isExternalHref('//cdn.example.com/x')).toBe(true);
    });

    it('treats mailto and tel as external', () => {
      expect(isExternalHref('mailto:a@b.co')).toBe(true);
      expect(isExternalHref('tel:+15551234567')).toBe(true);
    });

    it('treats site paths and anchors as internal (next-intl Link)', () => {
      expect(isExternalHref('/about')).toBe(false);
      expect(isExternalHref('/es/checklists/')).toBe(false);
      expect(isExternalHref('#section')).toBe(false);
      expect(isExternalHref('relative-page')).toBe(false);
    });

    it('handles non-strings safely', () => {
      expect(isExternalHref(undefined)).toBe(false);
      expect(isExternalHref(null)).toBe(false);
      expect(isExternalHref('')).toBe(false);
      expect(isExternalHref(42)).toBe(false);
    });
  });

  describe('defaultExternalTarget', () => {
    it('defaults to _blank for http(s) and //', () => {
      expect(defaultExternalTarget('https://x')).toBe('_blank');
      expect(defaultExternalTarget('//x')).toBe('_blank');
    });

    it('does not default _blank for mailto or tel', () => {
      expect(defaultExternalTarget('mailto:a@b.co')).toBeUndefined();
      expect(defaultExternalTarget('tel:1')).toBeUndefined();
    });
  });

  describe('resolveLocaleAwareHref', () => {
    it('leaves internal paths unchanged', () => {
      expect(resolveLocaleAwareHref('/contribute/')).toBe('/contribute/');
      expect(resolveLocaleAwareHref('/es/foo')).toBe('/es/foo');
    });

    it('leaves mailto, tel, and // unchanged (no paywall pass)', () => {
      expect(resolveLocaleAwareHref('mailto:a@b.co')).toBe('mailto:a@b.co');
      expect(resolveLocaleAwareHref('tel:1')).toBe('tel:1');
      expect(resolveLocaleAwareHref('//x/y')).toBe('//x/y');
    });

    it('applies paywall bypass for configured http(s) article URLs', () => {
      const out = resolveLocaleAwareHref('https://404media.co/some/article');
      expect(out).toContain('web.archive.org');
      expect(out).toContain('404media.co');
    });
  });
});
