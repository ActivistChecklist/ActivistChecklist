import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  evaluatePage,
  findDuplicateDescriptions,
  formatReport,
  hasFaqBlock,
  wordCount,
  TOP_GUIDE_SLUGS,
  FAQ_GUIDE_SLUGS,
} = require('../scripts/seo-audit.cjs');

function msgs(findings) {
  return findings.map((f) => f.message);
}

describe('wordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('hello world')).toBe(2);
    expect(wordCount('  a  b  c  ')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

describe('hasFaqBlock', () => {
  it('detects an <FAQ> element', () => {
    expect(hasFaqBlock('<FAQ>...</FAQ>')).toBe(true);
    expect(hasFaqBlock('<FAQ title="x">...')).toBe(true);
  });
  it('does not match unrelated content', () => {
    expect(hasFaqBlock('FAQ as plain text')).toBe(false);
    expect(hasFaqBlock('')).toBe(false);
  });
});

describe('evaluatePage', () => {
  const validDesc = 'A '.repeat(45).trim() + ' end.'; // ~95 chars

  it('passes a fully-populated non-top page', () => {
    const findings = evaluatePage({
      kind: 'page',
      slug: 'movies',
      frontmatter: {
        seoDescription: validDesc,
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '',
    });
    expect(findings).toEqual([]);
  });

  it('flags missing seoDescription', () => {
    const findings = evaluatePage({
      kind: 'page',
      slug: 'x',
      frontmatter: { firstPublished: '2025-01-01', lastUpdated: '2026-01-01' },
      body: '',
    });
    expect(msgs(findings)).toContain('seoDescription missing');
  });

  it('flags too-short and too-long seoDescription', () => {
    const tooShort = evaluatePage({
      kind: 'page',
      slug: 'x',
      frontmatter: { seoDescription: 'short', firstPublished: '2025-01-01', lastUpdated: '2026-01-01' },
      body: '',
    });
    expect(msgs(tooShort).some((m) => /seoDescription is \d+ chars; aim/.test(m))).toBe(true);

    const tooLong = evaluatePage({
      kind: 'page',
      slug: 'x',
      frontmatter: {
        seoDescription: 'a'.repeat(200),
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '',
    });
    expect(msgs(tooLong).some((m) => /hard ceiling/.test(m))).toBe(true);
  });

  it('flags missing dates', () => {
    const findings = evaluatePage({
      kind: 'page',
      slug: 'x',
      frontmatter: { seoDescription: validDesc },
      body: '',
    });
    expect(msgs(findings)).toContain('firstPublished missing');
    expect(msgs(findings)).toContain('lastUpdated missing');
  });

  it('flags top-8 guides missing seoTitle and answerCapsule', () => {
    const findings = evaluatePage({
      kind: 'guide',
      slug: 'signal', // top-8
      frontmatter: {
        seoDescription: validDesc,
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '<FAQ />',
    });
    expect(msgs(findings)).toContain('top-8 guide is missing seoTitle');
    expect(msgs(findings)).toContain('top-8 guide is missing answerCapsule');
  });

  it('does not flag seoTitle/answerCapsule on non-top guides', () => {
    const findings = evaluatePage({
      kind: 'guide',
      slug: 'research', // not top-8
      frontmatter: {
        seoDescription: validDesc,
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '',
    });
    expect(msgs(findings).some((m) => /top-8/.test(m))).toBe(false);
  });

  it('flags too-long seoTitle', () => {
    const findings = evaluatePage({
      kind: 'guide',
      slug: 'signal',
      frontmatter: {
        seoTitle: 'a'.repeat(70),
        seoDescription: validDesc,
        answerCapsule: 'word '.repeat(40).trim(),
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '<FAQ>x</FAQ>',
    });
    expect(msgs(findings).some((m) => /seoTitle is \d+ chars/.test(m))).toBe(true);
  });

  it('flags answerCapsule outside the 30–90 word range', () => {
    const tooShort = evaluatePage({
      kind: 'guide',
      slug: 'signal',
      frontmatter: {
        seoTitle: 'X',
        seoDescription: validDesc,
        answerCapsule: 'only a few words',
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: '<FAQ>x</FAQ>',
    });
    expect(msgs(tooShort).some((m) => /answerCapsule is \d+ words/.test(m))).toBe(true);
  });

  it('flags missing <FAQ> on FAQ_GUIDE_SLUGS pages', () => {
    const findings = evaluatePage({
      kind: 'guide',
      slug: 'signal',
      frontmatter: {
        seoTitle: 'X',
        seoDescription: validDesc,
        answerCapsule: 'word '.repeat(40).trim(),
        firstPublished: '2025-01-01',
        lastUpdated: '2026-01-01',
      },
      body: 'no FAQ here',
    });
    expect(msgs(findings)).toContain('top-3 guide is missing a <FAQ> block in the body');
  });
});

describe('findDuplicateDescriptions', () => {
  it('finds duplicates across files', () => {
    const entries = [
      { kind: 'guide', slug: 'a', frontmatter: { seoDescription: 'same' } },
      { kind: 'page', slug: 'b', frontmatter: { seoDescription: 'same' } },
      { kind: 'page', slug: 'c', frontmatter: { seoDescription: 'unique' } },
    ];
    const dups = findDuplicateDescriptions(entries);
    expect(dups).toHaveLength(1);
    expect(dups[0].desc).toBe('same');
    expect(dups[0].files).toContain('guides/a.mdx');
    expect(dups[0].files).toContain('pages/b.mdx');
  });

  it('ignores empty descriptions', () => {
    const entries = [
      { kind: 'guide', slug: 'a', frontmatter: { seoDescription: '' } },
      { kind: 'page', slug: 'b', frontmatter: {} },
    ];
    expect(findDuplicateDescriptions(entries)).toEqual([]);
  });
});

describe('formatReport', () => {
  it('reports clean when no findings', () => {
    const out = formatReport({ clean: 5, problems: [], duplicates: [] });
    expect(out).toContain('5 pages clean — no issues');
  });

  it('lists each problem and duplicate', () => {
    const out = formatReport({
      clean: 1,
      problems: [
        { kind: 'guide', slug: 'signal', findings: [{ severity: 'warn', message: 'X' }] },
      ],
      duplicates: [{ desc: 'dup', files: ['pages/a.mdx', 'pages/b.mdx'] }],
    });
    expect(out).toContain('content/en/guides/signal.mdx');
    expect(out).toContain('– X');
    expect(out).toContain('Duplicate seoDescription');
    expect(out).toContain('pages/a.mdx');
  });
});

describe('Top/FAQ slug lists', () => {
  it('top guides match the spec', () => {
    expect(TOP_GUIDE_SLUGS).toContain('signal');
    expect(TOP_GUIDE_SLUGS).toContain('emergency');
    expect(TOP_GUIDE_SLUGS).toHaveLength(8);
  });
  it('FAQ guides are a subset of top guides', () => {
    for (const s of FAQ_GUIDE_SLUGS) expect(TOP_GUIDE_SLUGS).toContain(s);
  });
});
