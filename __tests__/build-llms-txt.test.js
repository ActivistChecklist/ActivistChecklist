import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildLlmsTxt,
  buildItemParentMap,
  buildUrl,
  buildChecklistItemUrl,
  extractChecklistItemSlugs,
  firstSentence,
  formatListEntry,
  resolveEntryDescription,
  stripMdxToPlainText,
} = require('../scripts/build-llms-txt.cjs');

const SITE = 'https://activistchecklist.org';

describe('buildUrl', () => {
  it('omits locale prefix for English', () => {
    expect(buildUrl(SITE, 'en', 'signal')).toBe(`${SITE}/signal/`);
  });
  it('prefixes other locales', () => {
    expect(buildUrl(SITE, 'es', 'signal')).toBe(`${SITE}/es/signal/`);
  });
});

describe('buildChecklistItemUrl', () => {
  it('appends item slug as a hash to parent guide URL', () => {
    expect(buildChecklistItemUrl(SITE, 'en', 'essentials', 'password-manager')).toBe(
      `${SITE}/essentials/#password-manager`
    );
    expect(buildChecklistItemUrl(SITE, 'es', 'essentials', 'password-manager')).toBe(
      `${SITE}/es/essentials/#password-manager`
    );
  });
});

describe('extractChecklistItemSlugs', () => {
  it('extracts and dedupes in body order', () => {
    const mdx = `<ChecklistItem slug="a" />\n<ChecklistItem slug="b" />\n<ChecklistItem slug="a" />`;
    expect(extractChecklistItemSlugs(mdx)).toEqual(['a', 'b']);
  });

  it('returns empty array for empty content', () => {
    expect(extractChecklistItemSlugs('')).toEqual([]);
  });
});

describe('buildItemParentMap', () => {
  it('assigns each item to the alphabetically-first guide that references it', () => {
    const guides = [
      { slug: 'zeta', content: '<ChecklistItem slug="signal" />' },
      { slug: 'alpha', content: '<ChecklistItem slug="signal" /><ChecklistItem slug="location" />' },
    ];
    const map = buildItemParentMap(guides);
    expect(map.get('signal')).toBe('alpha');
    expect(map.get('location')).toBe('alpha');
  });
});

describe('stripMdxToPlainText', () => {
  it('removes self-closing JSX', () => {
    expect(stripMdxToPlainText('Before <Alert /> after')).toBe('Before after');
  });
  it('removes open/close JSX tags', () => {
    expect(stripMdxToPlainText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });
  it('strips markdown links to text', () => {
    expect(stripMdxToPlainText('See [Signal](https://signal.org/) docs.')).toBe('See Signal docs.');
  });
});

describe('firstSentence', () => {
  it('takes the first sentence terminator after >20 chars', () => {
    expect(firstSentence('This is a long enough sentence. Second one.')).toBe(
      'This is a long enough sentence.'
    );
  });
  it('truncates with ellipsis when no terminator found', () => {
    const long = 'a'.repeat(200);
    const out = firstSentence(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('resolveEntryDescription', () => {
  it('prefers seoDescription', () => {
    expect(
      resolveEntryDescription({
        frontmatter: { seoDescription: 'A', excerpt: 'B' },
        body: 'C',
      })
    ).toBe('A');
  });
  it('falls back to body sentence', () => {
    expect(
      resolveEntryDescription({
        frontmatter: {},
        body: 'This is a description of the page. Etc.',
      })
    ).toBe('This is a description of the page.');
  });
});

describe('formatListEntry', () => {
  it('renders title, url, description', () => {
    expect(formatListEntry('Signal', '/signal/', 'Lock down Signal.')).toBe(
      '- [Signal](/signal/): Lock down Signal.'
    );
  });
  it('omits trailing colon when description is empty', () => {
    expect(formatListEntry('Signal', '/signal/', '')).toBe('- [Signal](/signal/)');
    expect(formatListEntry('Signal', '/signal/', undefined)).toBe('- [Signal](/signal/)');
  });
});

describe('buildLlmsTxt', () => {
  const guides = [
    {
      slug: 'signal',
      frontmatter: { title: 'Signal Security Checklist', seoDescription: 'Lock down Signal.' },
      content: '<ChecklistItem slug="signal-disappearing" />',
    },
    {
      slug: 'essentials',
      frontmatter: { title: 'Security Essentials', seoDescription: 'Start here.' },
      content: '<ChecklistItem slug="password-manager" />',
    },
  ];
  const pages = [
    { slug: 'about', frontmatter: { title: 'About', seoDescription: 'About us.' }, content: '' },
  ];
  const checklistItems = [
    {
      slug: 'signal-disappearing',
      frontmatter: { title: 'Turn on disappearing messages' },
      content: 'Auto-deletes messages after a set time.',
    },
    {
      slug: 'password-manager',
      frontmatter: { title: 'Use a password manager' },
      content: 'Stores unique passwords per account.',
    },
  ];

  it('includes site name and tagline at the top', () => {
    const out = buildLlmsTxt({ siteUrl: SITE, locale: 'en', guides, pages, checklistItems });
    expect(out).toMatch(/^# Activist Checklist/);
    expect(out).toMatch(/> .+/);
  });

  it('emits Guides, Pages, and Checklist items sections', () => {
    const out = buildLlmsTxt({ siteUrl: SITE, locale: 'en', guides, pages, checklistItems });
    expect(out).toContain('## Guides');
    expect(out).toContain('## Pages');
    expect(out).toContain('## Checklist items');
  });

  it('links checklist items under their parent guide with anchor', () => {
    const out = buildLlmsTxt({ siteUrl: SITE, locale: 'en', guides, pages, checklistItems });
    expect(out).toContain(`${SITE}/signal/#signal-disappearing`);
    expect(out).toContain(`${SITE}/essentials/#password-manager`);
  });

  it('uses /es/ prefix for Spanish locale', () => {
    const out = buildLlmsTxt({ siteUrl: SITE, locale: 'es', guides, pages, checklistItems });
    expect(out).toContain(`${SITE}/es/signal/`);
    expect(out).toContain(`${SITE}/es/signal/#signal-disappearing`);
  });

  it('omits checklist-items section when no items are referenced by any guide', () => {
    const out = buildLlmsTxt({
      siteUrl: SITE,
      locale: 'en',
      guides: [{ slug: 'x', frontmatter: { title: 'X' }, content: '' }],
      pages: [],
      checklistItems: [{ slug: 'orphan', frontmatter: { title: 'Orphan' }, content: '' }],
    });
    expect(out).not.toContain('## Checklist items');
  });
});

