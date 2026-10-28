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

  it('normalizes French and /en/-prefixed paths to English canonical', () => {
    expect(normalizeToEnCanonicalPath('/fr/signal/')).toBe('/signal/');
    expect(normalizeToEnCanonicalPath('/fr')).toBe('/');
    expect(normalizeToEnCanonicalPath('/en/signal/')).toBe('/signal/');
    expect(normalizeToEnCanonicalPath('/en')).toBe('/');
  });

  it('does not strip a top-level segment that only starts with a locale code', () => {
    expect(normalizeToEnCanonicalPath('/esim/')).toBe('/esim/');
    expect(normalizeToEnCanonicalPath('/free/')).toBe('/free/');
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

  it('emits en, every other locale, and x-default (including in production)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const refs = buildHreflangAlternateRefs('/signal/');
    expect(refs.map((r) => r.hreflang)).toEqual(['en', 'es', 'fr', 'it', 'ja', 'x-default']);
    expect(refs.find((r) => r.hreflang === 'en').href).toBe(
      'https://activistchecklist.org/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'es').href).toBe(
      'https://activistchecklist.org/es/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'fr').href).toBe(
      'https://activistchecklist.org/fr/signal/',
    );
    expect(refs.find((r) => r.hreflang === 'x-default').href).toBe(
      'https://activistchecklist.org/signal/',
    );
  });

  it('uses the bare locale root for the home page', () => {
    const refs = buildHreflangAlternateRefs('/fr/');
    expect(refs.find((r) => r.hreflang === 'en').href).toBe('https://activistchecklist.org/');
    expect(refs.find((r) => r.hreflang === 'fr').href).toBe('https://activistchecklist.org/fr/');
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
