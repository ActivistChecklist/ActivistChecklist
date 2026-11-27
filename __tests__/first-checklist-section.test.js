import { describe, it, expect } from 'vitest';
import { firstChecklistSectionSlug } from '../lib/inline-cta-split';

describe('firstChecklistSectionSlug', () => {
  it('returns the slug of the first section with checklist items', () => {
    const content = [
      '<Section title="Hide your identity" slug="identity">',
      '  <ChecklistItemGroup>',
      '    <ChecklistItem slug="signal-display-name" />',
      '  </ChecklistItemGroup>',
      '</Section>',
      '<Section title="Messages" slug="messages">',
      '  <ChecklistItem slug="disappearing" />',
      '</Section>',
    ].join('\n');
    expect(firstChecklistSectionSlug(content)).toBe('identity');
  });

  it('skips intro sections without checklist items', () => {
    const content = [
      '<Section title="Why does this matter?">',
      '  Some text.',
      '</Section>',
      '<Section title="Do this first" slug="baseline">',
      '  <ChecklistItem slug="updates" />',
      '</Section>',
    ].join('\n');
    expect(firstChecklistSectionSlug(content)).toBe('baseline');
  });

  it('finds the slug whatever order the attributes are in', () => {
    const content = '<Section slug="first" title="First">\n<ChecklistItem slug="a" />\n</Section>';
    expect(firstChecklistSectionSlug(content)).toBe('first');
  });

  it('returns null when the first checklist section has no slug to link to', () => {
    const content = [
      '<Section title="Intro" slug="tor">',
      '  Text only.',
      '</Section>',
      '<Section title="Scouting">',
      '  <ChecklistItem slug="scouting-maps" />',
      '</Section>',
    ].join('\n');
    expect(firstChecklistSectionSlug(content)).toBeNull();
  });

  it('returns null when there are no sections', () => {
    expect(firstChecklistSectionSlug('Just a how-to with no checklist.')).toBeNull();
    expect(firstChecklistSectionSlug('')).toBeNull();
  });
});
