import { createRequire } from 'module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  normalizeToEnCanonicalPath,
  buildHreflangAlternateRefs,
  seoPriorityAndChangefreq,
} = require('../scripts/sitemap-seo-fields.cjs');

describe('normalizeToEnCanonicalPath', () => {
  it('normalizes Spanish paths to English canonical', () => {
    expect(normalizeToEnCanonicalPath('/es/signal/')).toBe('/signal/');
    expect(normalizeToEnCanonicalPath('/es/')).toBe('/');
  });

  it('leaves English paths unchanged', () => {
    expect(normalizeToEnCanonicalPath('/signal/')).toBe('/signal/');
    expect(normalizeToEnCanonicalPath('/')).toBe('/');
  });
});

describe('buildHreflangAlternateRefs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('emits en, es, ar, and x-default (including in production)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const refs = buildHreflangAlternateRefs('/signal/');
    expect(refs).toHaveLength(4);
    expect(refs.find((r) => r.hreflang === 'en').href).toBe(
      'https://activistchecklist.org/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'es').href).toBe(
      'https://activistchecklist.org/es/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'ar').href).toBe(
      'https://activistchecklist.org/ar/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'x-default').href).toBe(
      'https://activistchecklist.org/signal/',
    );
  });
});

describe('seoPriorityAndChangefreq', () => {
  it('gives higher priority to home', () => {
    expect(seoPriorityAndChangefreq('/')).toEqual({ priority: 1, changefreq: 'weekly' });
  });

  it('uses hub settings for listing pages', () => {
    expect(seoPriorityAndChangefreq('/news/')).toEqual({
      priority: 0.85,
      changefreq: 'weekly',
    });
  });
});
