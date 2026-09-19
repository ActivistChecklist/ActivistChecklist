/**
 * generateMetadata in app/[locale]/[...slug]/page.tsx resolves <title> and
 * <meta name="description"> from frontmatter using a documented fallback
 * chain. The page code interleaves Next/Keystatic concerns; the resolution
 * itself is small enough to mirror as pure functions here so we lock in the
 * precedence rules.
 *
 * Keep this in sync with the resolution block in app/[locale]/[...slug]/page.tsx.
 */

const DEFAULT_DESCRIPTION =
  'Plain language steps for digital security, because protecting yourself helps keep your whole community safer. Built by activists, for activists with field-tested, community-verified guides.';

const TITLE_SUFFIX = ' | Digital Security Checklists for Activists';

function resolveTitle(frontmatter) {
  const fm = frontmatter || {};
  if (fm.seoTitle) return fm.seoTitle;
  if (fm.title) return `${fm.title}${TITLE_SUFFIX}`;
  return 'Digital Security Checklists for Activists';
}

function resolveDescription(frontmatter) {
  const fm = frontmatter || {};
  return (
    fm.seoDescription ||
    fm.excerpt ||
    fm.summary ||
    fm.description ||
    DEFAULT_DESCRIPTION
  );
}

describe('title resolution', () => {
  it('uses seoTitle verbatim when set', () => {
    expect(resolveTitle({ seoTitle: 'Signal Security Checklist for Activists (2026)' })).toBe(
      'Signal Security Checklist for Activists (2026)'
    );
  });
  it('seoTitle takes priority over title', () => {
    expect(resolveTitle({ seoTitle: 'X', title: 'Y' })).toBe('X');
  });
  it('falls back to suffixed title pattern when no seoTitle', () => {
    expect(resolveTitle({ title: 'Security Essentials' })).toBe(
      `Security Essentials${TITLE_SUFFIX}`
    );
  });
  it('falls back to a generic title with no frontmatter title', () => {
    expect(resolveTitle({})).toBe('Digital Security Checklists for Activists');
  });
});

describe('description resolution', () => {
  it('prefers seoDescription over excerpt/summary/description', () => {
    expect(
      resolveDescription({
        seoDescription: 'A',
        excerpt: 'B',
        summary: 'C',
        description: 'D',
      })
    ).toBe('A');
  });
  it('falls back to excerpt → summary → description', () => {
    expect(resolveDescription({ excerpt: 'B', summary: 'C', description: 'D' })).toBe('B');
    expect(resolveDescription({ summary: 'C', description: 'D' })).toBe('C');
    expect(resolveDescription({ description: 'D' })).toBe('D');
  });
  it('falls back to DEFAULT_DESCRIPTION when nothing is set', () => {
    expect(resolveDescription({})).toBe(DEFAULT_DESCRIPTION);
    expect(resolveDescription(null)).toBe(DEFAULT_DESCRIPTION);
  });
});
