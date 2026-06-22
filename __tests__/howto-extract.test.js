import { describe, it, expect } from 'vitest';
import { extractHowToBlocks, hasHowToBlock } from '../lib/howto-extract';

describe('extractHowToBlocks', () => {
  it('returns null when no HowTo block is present', () => {
    expect(extractHowToBlocks('Just some plain text.')).toBeNull();
    expect(extractHowToBlocks('')).toBeNull();
    expect(extractHowToBlocks(null)).toBeNull();
    expect(extractHowToBlocks(undefined)).toBeNull();
  });

  it('extracts a single HowTo block and strips its title attribute', () => {
    const input = `Intro paragraph.

<HowTo title="How to do it">
  Step one.

  Step two.
</HowTo>

Trailing paragraph.`;
    const result = extractHowToBlocks(input);
    expect(result).toContain('<HowTo>');
    expect(result).not.toContain('title="How to do it"');
    expect(result).toContain('Step one.');
    expect(result).toContain('Step two.');
    expect(result).toContain('</HowTo>');
    expect(result).not.toContain('Intro paragraph.');
    expect(result).not.toContain('Trailing paragraph.');
  });

  it('keeps titles when there are multiple HowTo blocks', () => {
    const input = `<HowTo title="First">
  A
</HowTo>

Between text that should be dropped.

<HowTo title="Second">
  B
</HowTo>`;
    const result = extractHowToBlocks(input);
    expect(result).toContain('title="First"');
    expect(result).toContain('title="Second"');
    expect(result).not.toContain('Between text');
  });

  it('preserves inner Alert tags', () => {
    const input = `<HowTo title="X">
  <Alert type="warning">Heads up</Alert>
</HowTo>`;
    const result = extractHowToBlocks(input);
    expect(result).toContain('<Alert type="warning">Heads up</Alert>');
  });

  it('handles HowTo without a title attribute', () => {
    const input = `<HowTo>
  Untitled content
</HowTo>`;
    const result = extractHowToBlocks(input);
    expect(result).toContain('<HowTo>');
    expect(result).toContain('Untitled content');
  });
});

describe('hasHowToBlock', () => {
  it('returns true when a HowTo block exists', () => {
    expect(hasHowToBlock('<HowTo>x</HowTo>')).toBe(true);
    expect(hasHowToBlock('text <HowTo title="t">x</HowTo> text')).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(hasHowToBlock('no how to here')).toBe(false);
    expect(hasHowToBlock('')).toBe(false);
    expect(hasHowToBlock(null)).toBe(false);
  });
});
