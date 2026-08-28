import {
  canonicalUrl,
  resolveDescription,
  parseEstimatedTimeToIso,
  extractChecklistItemSlugsFromMdx,
  checklistItemStepText,
  buildOrganization,
  buildWebSite,
  buildBreadcrumb,
  buildArticle,
  buildHowTo,
  buildFaqPage,
  buildContentPageGraph,
  buildHomePageGraph,
  serializeJsonLd,
  TOP_GUIDE_SLUGS,
} from '@/lib/structured-data';

const BASE = 'https://activistchecklist.org';

describe('canonicalUrl', () => {
  it('uses no locale prefix for English', () => {
    expect(canonicalUrl(BASE, 'en', 'signal')).toBe(`${BASE}/signal/`);
  });

  it('prefixes non-default locales', () => {
    expect(canonicalUrl(BASE, 'es', 'signal')).toBe(`${BASE}/es/signal/`);
  });

  it('handles the home slug (empty)', () => {
    expect(canonicalUrl(BASE, 'en', '')).toBe(`${BASE}/`);
    expect(canonicalUrl(BASE, 'es', '')).toBe(`${BASE}/es/`);
  });

  it('strips surrounding slashes from the slug', () => {
    expect(canonicalUrl(BASE, 'en', '/signal/')).toBe(`${BASE}/signal/`);
  });
});

describe('resolveDescription', () => {
  it('prefers seoDescription', () => {
    expect(
      resolveDescription({ seoDescription: 'A', excerpt: 'B', summary: 'C' })
    ).toBe('A');
  });

  it('falls back through excerpt → summary → description → fallback', () => {
    expect(resolveDescription({ excerpt: 'X' })).toBe('X');
    expect(resolveDescription({ summary: 'Y' })).toBe('Y');
    expect(resolveDescription({ description: 'Z' })).toBe('Z');
    expect(resolveDescription({}, 'fallback')).toBe('fallback');
    expect(resolveDescription(null, 'fb')).toBe('fb');
    expect(resolveDescription({})).toBe('');
  });
});

describe('parseEstimatedTimeToIso', () => {
  it('parses minutes', () => {
    expect(parseEstimatedTimeToIso('45 minutes')).toBe('PT45M');
    expect(parseEstimatedTimeToIso('30 min')).toBe('PT30M');
  });

  it('parses hours', () => {
    expect(parseEstimatedTimeToIso('1 hour')).toBe('PT1H');
    expect(parseEstimatedTimeToIso('3 hours')).toBe('PT3H');
  });

  it('takes the upper bound of a range', () => {
    expect(parseEstimatedTimeToIso('30-60 minutes')).toBe('PT60M');
    expect(parseEstimatedTimeToIso('20 minutes - 2 hours')).toBe('PT2H');
  });

  it('handles "1 hour to start, 4 hours to finish"', () => {
    expect(parseEstimatedTimeToIso('1 hour to start, 4 hours to finish')).toBe('PT4H');
  });

  it('returns null for unparseable input', () => {
    expect(parseEstimatedTimeToIso('')).toBeNull();
    expect(parseEstimatedTimeToIso(null)).toBeNull();
    expect(parseEstimatedTimeToIso('a while')).toBeNull();
    expect(parseEstimatedTimeToIso('45 minutes for baseline protections')).toBe('PT45M');
  });

  it('combines mixed hour+minute units', () => {
    expect(parseEstimatedTimeToIso('1 hour 30 minutes')).toBe('PT1H30M');
    expect(parseEstimatedTimeToIso('2 hours 15 min')).toBe('PT2H15M');
    expect(parseEstimatedTimeToIso('45 min')).toBe('PT45M');
  });
});

describe('extractChecklistItemSlugsFromMdx', () => {
  it('preserves body order and dedupes', () => {
    const mdx = `
      <ChecklistItem slug="signal-disappearing" />
      <ChecklistItem slug="location" />
      <ChecklistItem slug="signal-disappearing" />
    `;
    expect(extractChecklistItemSlugsFromMdx(mdx)).toEqual([
      'signal-disappearing',
      'location',
    ]);
  });

  it('returns empty array for empty/null input', () => {
    expect(extractChecklistItemSlugsFromMdx('')).toEqual([]);
    expect(extractChecklistItemSlugsFromMdx(null)).toEqual([]);
  });
});

describe('checklistItemStepText', () => {
  it('returns first paragraph stripped of MDX tags', () => {
    const body = `Your bank accounts and cell phone provider are high-value targets.

      Adding a PIN helps protect.`;
    expect(checklistItemStepText(body)).toContain('Your bank accounts');
    expect(checklistItemStepText(body)).not.toContain('Adding a PIN');
  });

  it('strips markdown link syntax', () => {
    expect(checklistItemStepText('Generate a [random PIN](https://x.com).')).toBe(
      'Generate a random PIN.'
    );
  });

  it('returns empty string for empty input', () => {
    expect(checklistItemStepText('')).toBe('');
    expect(checklistItemStepText(null)).toBe('');
  });

  it('strips nested/adversarial tag patterns to stable (no residual <script>)', () => {
    // Defense-in-depth: a single regex pass would leave a residual <script>.
    expect(checklistItemStepText('<scr<Alert />ipt>')).not.toMatch(/<script/i);
    expect(checklistItemStepText('<scr<Alert />ipt>alert(1)</scr<Alert />ipt>')).not.toMatch(/<script/i);
  });
});

describe('buildOrganization', () => {
  it('emits Organization with id, logo, sameAs', () => {
    const org = buildOrganization(BASE);
    expect(org['@type']).toBe('Organization');
    expect(org['@id']).toBe(`${BASE}/#organization`);
    expect(org.logo.url).toContain('/images/logo-');
    expect(Array.isArray(org.sameAs)).toBe(true);
    expect(org.sameAs.length).toBeGreaterThan(0);
  });
});

describe('buildWebSite', () => {
  it('uses per-locale @id', () => {
    expect(buildWebSite(BASE, 'en')['@id']).toBe(`${BASE}/#website-en`);
    expect(buildWebSite(BASE, 'es')['@id']).toBe(`${BASE}/#website-es`);
  });

  it('sets inLanguage and publisher reference', () => {
    const ws = buildWebSite(BASE, 'en');
    expect(ws.inLanguage).toBe('en');
    expect(ws.publisher['@id']).toBe(`${BASE}/#organization`);
  });
});

describe('buildBreadcrumb', () => {
  it('returns Home → Page items', () => {
    const bc = buildBreadcrumb({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      title: 'Signal Security Checklist',
    });
    expect(bc.itemListElement).toHaveLength(2);
    expect(bc.itemListElement[0].item).toBe(`${BASE}/`);
    expect(bc.itemListElement[1].item).toBe(`${BASE}/signal/`);
    expect(bc.itemListElement[1].name).toBe('Signal Security Checklist');
  });

  it('returns null for the home page', () => {
    expect(
      buildBreadcrumb({ baseUrl: BASE, locale: 'en', slug: '', title: 'Home' })
    ).toBeNull();
  });
});

describe('buildArticle', () => {
  const fm = {
    title: 'Signal Security Checklist',
    seoDescription: 'Lock down Signal.',
    firstPublished: '2025-01-27',
    lastUpdated: '2026-04-03',
  };

  it('builds Article with dates from frontmatter', () => {
    const a = buildArticle({ baseUrl: BASE, locale: 'en', slug: 'signal', frontmatter: fm });
    expect(a['@type']).toBe('Article');
    expect(a.datePublished).toBe('2025-01-27');
    expect(a.dateModified).toBe('2026-04-03');
    expect(a.description).toBe('Lock down Signal.');
    expect(a.url).toBe(`${BASE}/signal/`);
    expect(a.inLanguage).toBe('en');
  });

  it('omits dateModified when no lastUpdated', () => {
    const a = buildArticle({
      baseUrl: BASE,
      locale: 'en',
      slug: 'x',
      frontmatter: { title: 'X', firstPublished: '2024-01-01' },
    });
    expect(a.datePublished).toBe('2024-01-01');
    expect(a.dateModified).toBe('2024-01-01'); // falls back to firstPublished
  });

  it('omits dates entirely when neither is set', () => {
    const a = buildArticle({ baseUrl: BASE, locale: 'en', slug: 'x', frontmatter: { title: 'X' } });
    expect(a.datePublished).toBeUndefined();
    expect(a.dateModified).toBeUndefined();
  });

  it('includes image when provided', () => {
    const a = buildArticle({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: fm,
      imageUrl: `${BASE}/og/signal.png`,
    });
    expect(a.image).toBe(`${BASE}/og/signal.png`);
  });

  it('uses seoTitle for headline when both seoTitle and title are set', () => {
    const a = buildArticle({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: {
        title: 'Signal Security Checklist',
        seoTitle: 'Signal Security Checklist for Activists (2026)',
      },
    });
    expect(a.headline).toBe('Signal Security Checklist for Activists (2026)');
  });
});

describe('buildHowTo', () => {
  const itemsBySlug = {
    'signal-disappearing': {
      frontmatter: { title: 'Turn on disappearing messages' },
      content: 'Disappearing messages auto-delete after a set time. This protects past conversations.',
    },
    'screen-lock': {
      frontmatter: { title: 'Enable screen lock' },
      content: 'Screen lock prevents others from opening Signal without your PIN.',
    },
  };

  it('emits one step per checklist item, in body order', () => {
    const howTo = buildHowTo({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: { title: 'Signal Security Checklist', estimatedTime: '15 minutes' },
      checklistItemSlugs: ['signal-disappearing', 'screen-lock'],
      checklistItemsBySlug: itemsBySlug,
    });
    expect(howTo['@type']).toBe('HowTo');
    expect(howTo.step).toHaveLength(2);
    expect(howTo.step[0].name).toBe('Turn on disappearing messages');
    expect(howTo.step[0].url).toBe(`${BASE}/signal/#signal-disappearing`);
    expect(howTo.step[0].position).toBe(1);
    expect(howTo.step[1].position).toBe(2);
    expect(howTo.totalTime).toBe('PT15M');
  });

  it('returns null when no items are provided', () => {
    expect(
      buildHowTo({
        baseUrl: BASE,
        locale: 'en',
        slug: 'signal',
        frontmatter: {},
        checklistItemSlugs: [],
        checklistItemsBySlug: {},
      })
    ).toBeNull();
  });

  it('skips items not found in itemsBySlug', () => {
    const howTo = buildHowTo({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: { title: 'X' },
      checklistItemSlugs: ['signal-disappearing', 'nonexistent'],
      checklistItemsBySlug: itemsBySlug,
    });
    expect(howTo.step).toHaveLength(1);
  });
});

describe('buildFaqPage', () => {
  it('emits Question/Answer pairs', () => {
    const faq = buildFaqPage([
      { question: 'Is Signal secure?', text: 'Yes.' },
      { question: 'Is WhatsApp safe?', text: 'Less so.' },
    ]);
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity).toHaveLength(2);
    expect(faq.mainEntity[0].name).toBe('Is Signal secure?');
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe('Yes.');
  });

  it('returns null when no valid pairs', () => {
    expect(buildFaqPage([])).toBeNull();
    expect(buildFaqPage([{ question: '', text: 'x' }])).toBeNull();
  });
});

describe('buildContentPageGraph', () => {
  it('includes Article + BreadcrumbList', () => {
    const g = buildContentPageGraph({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: { title: 'Signal', seoDescription: 'X', firstPublished: '2025-01-01', lastUpdated: '2026-01-01' },
    });
    expect(g['@context']).toBe('https://schema.org');
    const types = g['@graph'].map((n) => n['@type']);
    expect(types).toContain('Article');
    expect(types).toContain('BreadcrumbList');
  });

  it('appends HowTo when provided', () => {
    const g = buildContentPageGraph({
      baseUrl: BASE,
      locale: 'en',
      slug: 'signal',
      frontmatter: { title: 'Signal' },
      howTo: { '@type': 'HowTo', name: 'Signal', step: [{ '@type': 'HowToStep', position: 1, name: 'x' }] },
    });
    expect(g['@graph'].some((n) => n['@type'] === 'HowTo')).toBe(true);
  });
});

describe('buildHomePageGraph', () => {
  it('includes Organization + WebSite', () => {
    const g = buildHomePageGraph({ baseUrl: BASE, locale: 'en' });
    const types = g['@graph'].map((n) => n['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
  });
});

describe('serializeJsonLd', () => {
  it('escapes < and > to prevent breaking out of <script>', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c');
  });

  it('produces parseable JSON after unescape', () => {
    const out = serializeJsonLd({ a: 1, b: 'hello' });
    // Unescape \u00XX so we can parse it back
    const restored = out.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
    expect(JSON.parse(restored)).toEqual({ a: 1, b: 'hello' });
  });
});

describe('TOP_GUIDE_SLUGS', () => {
  it('matches the spec order', () => {
    expect(TOP_GUIDE_SLUGS).toEqual([
      'signal',
      'essentials',
      'travel',
      'ice',
      'protest',
      'doxxing',
      'secondary',
      'emergency',
    ]);
  });
});
