import { describe, it, expect } from 'vitest';
import { splitGuideBodyForCta } from '../lib/inline-cta-split';

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
