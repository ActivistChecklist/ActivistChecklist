import { describe, it, expect } from 'vitest';
import { guideToCardCopy } from '../lib/guide-card-copy';

describe('guideToCardCopy', () => {
  it('uses title and flattens excerpt', () => {
    const out = guideToCardCopy({
      frontmatter: {
        title: 'Spyware guide',
        excerpt: 'Line one.\n\nLine two.',
      },
    });
    expect(out.title).toBe('Spyware guide');
    expect(out.description).toBe('Line one. Line two.');
  });

  it('uses summary when excerpt missing', () => {
    expect(
      guideToCardCopy({
        frontmatter: { title: 'T', summary: 'Short summary' },
      }).description
    ).toBe('Short summary');
  });
});
