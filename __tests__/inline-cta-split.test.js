import { describe, it, expect } from 'vitest';
import { splitGuideBodyForCta, splitPageContentForCta } from '../lib/inline-cta-split';

describe('splitGuideBodyForCta', () => {
  it('splits after the first Section that contains a ChecklistItem', () => {
    const content = [
      '<Section title="Get started" slug="get-started">',
      '  <ChecklistItem slug="signal" />',
      '</Section>',
      '',
      '<Section title="Next" slug="next">',
      '  <ChecklistItem slug="updates" />',
      '</Section>',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta(content);

    expect(didSplit).toBe(true);
    expect(beforeCta).toContain('Get started');
    expect(beforeCta).toContain('signal');
    expect(beforeCta.trim().endsWith('</Section>')).toBe(true);
    expect(afterCta).toContain('Next');
    expect(afterCta).not.toContain('Get started');
  });

  it('skips intro-only sections without checklist items', () => {
    const content = [
      '<Section title="Intro" slug="intro">',
      '  Some plain text explaining the guide.',
      '</Section>',
      '',
      '<Section title="Steps" slug="steps">',
      '  <ChecklistItemGroup>',
      '    <ChecklistItem slug="foo" />',
      '  </ChecklistItemGroup>',
      '</Section>',
      '',
      '<Section title="More" slug="more">',
      '  <ChecklistItem slug="bar" />',
      '</Section>',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta(content);

    expect(didSplit).toBe(true);
    expect(beforeCta).toContain('Intro');
    expect(beforeCta).toContain('Steps');
    expect(beforeCta).toContain('foo');
    expect(beforeCta).not.toContain('More');
    expect(afterCta).toContain('More');
    expect(afterCta).toContain('bar');
  });

  it('returns didSplit=false when no section has checklist items', () => {
    const content = [
      '<Section title="A" slug="a">Just text.</Section>',
      '<Section title="B" slug="b">More text.</Section>',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta(content);

    expect(didSplit).toBe(false);
    expect(beforeCta).toBe(content);
    expect(afterCta).toBe('');
  });

  it('returns didSplit=false when content is empty', () => {
    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta('');
    expect(didSplit).toBe(false);
    expect(beforeCta).toBe('');
    expect(afterCta).toBe('');
  });

  it('skips auto-split when content contains a manual <InlineCta />', () => {
    const content = [
      '<Section title="Get started" slug="get-started">',
      '  <ChecklistItem slug="signal" />',
      '</Section>',
      '',
      '<InlineCta />',
      '',
      '<Section title="Next" slug="next">',
      '  <ChecklistItem slug="updates" />',
      '</Section>',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta(content);

    expect(didSplit).toBe(false);
    expect(beforeCta).toBe(content);
    expect(afterCta).toBe('');
  });

  it('handles a single section with checklist items by leaving afterCta empty', () => {
    const content = [
      '<Section title="Only" slug="only">',
      '  <ChecklistItem slug="alpha" />',
      '</Section>',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitGuideBodyForCta(content);

    expect(didSplit).toBe(true);
    expect(beforeCta).toContain('alpha');
    expect(afterCta).toBe('');
  });
});

describe('splitPageContentForCta', () => {
  it('splits before the second H2', () => {
    const content = [
      'Intro paragraph.',
      '',
      '## First heading',
      '',
      'Some body content.',
      '',
      '## Second heading',
      '',
      'More content.',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitPageContentForCta(content);

    expect(didSplit).toBe(true);
    expect(beforeCta).toContain('First heading');
    expect(beforeCta).toContain('Some body content');
    expect(beforeCta).not.toContain('Second heading');
    expect(afterCta).toMatch(/^##\s+Second heading/);
  });

  it('returns didSplit=false when there is only one H2', () => {
    const content = ['Intro.', '', '## Only heading', '', 'Body.'].join('\n');

    const { beforeCta, afterCta, didSplit } = splitPageContentForCta(content);

    expect(didSplit).toBe(false);
    expect(beforeCta).toBe(content);
    expect(afterCta).toBe('');
  });

  it('returns didSplit=false when there are no H2s', () => {
    const content = 'Just some paragraphs, no headings here.';

    const { beforeCta, afterCta, didSplit } = splitPageContentForCta(content);

    expect(didSplit).toBe(false);
    expect(beforeCta).toBe(content);
    expect(afterCta).toBe('');
  });

  it('skips auto-split when content contains a manual <InlineCta />', () => {
    const content = [
      '## One',
      'Body.',
      '<InlineCta />',
      '## Two',
      'More.',
    ].join('\n');

    const { didSplit, beforeCta } = splitPageContentForCta(content);

    expect(didSplit).toBe(false);
    expect(beforeCta).toBe(content);
  });

  it('ignores `## ` inside fenced code blocks', () => {
    const content = [
      '## Real heading',
      '',
      '```',
      '## not a heading',
      '## also not',
      '```',
      '',
      'Body.',
    ].join('\n');

    const { didSplit } = splitPageContentForCta(content);

    expect(didSplit).toBe(false);
  });

  it('recognizes raw <h2> tags', () => {
    const content = [
      '<h2>First</h2>',
      'Body.',
      '<h2>Second</h2>',
      'More.',
    ].join('\n');

    const { beforeCta, afterCta, didSplit } = splitPageContentForCta(content);

    expect(didSplit).toBe(true);
    expect(beforeCta).toContain('First');
    expect(beforeCta).not.toContain('Second');
    expect(afterCta).toContain('Second');
  });

  it('does not treat ### as ##', () => {
    const content = ['## H2', 'Body.', '### H3', 'More.'].join('\n');
    const { didSplit } = splitPageContentForCta(content);
    expect(didSplit).toBe(false);
  });
});
