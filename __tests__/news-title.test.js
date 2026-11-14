import { describe, it, expect } from 'vitest';
import { stripSourceSuffix } from '../lib/news-title.cjs';

describe('stripSourceSuffix', () => {
  it('drops a trailing " - Source" that matches the source', () => {
    expect(
      stripSourceSuffix(
        'ICE Planning $100 Million ‘Nightmare’ Domestic Spy Program - The American Prospect',
        'The American Prospect',
      ),
    ).toBe('ICE Planning $100 Million ‘Nightmare’ Domestic Spy Program');
  });

  it('handles the "|" and en dash separators', () => {
    expect(
      stripSourceSuffix(
        'Apple fixes bug that cops used to extract deleted chat messages from iPhones | TechCrunch',
        'TechCrunch',
      ),
    ).toBe('Apple fixes bug that cops used to extract deleted chat messages from iPhones');
    expect(stripSourceSuffix('Some headline – WIRED', 'WIRED')).toBe('Some headline');
  });

  it('ignores case and regex characters in the source name', () => {
    expect(stripSourceSuffix('Headline - the citizen lab', 'The Citizen Lab')).toBe('Headline');
    expect(stripSourceSuffix('Headline | 404 Media (US)', '404 Media (US)')).toBe('Headline');
  });

  it('leaves the title alone when the suffix is a different name', () => {
    expect(stripSourceSuffix('Headline - The Intercept', 'WIRED')).toBe('Headline - The Intercept');
  });

  it('leaves a source name inside the title alone', () => {
    expect(stripSourceSuffix('WIRED reports on ICE', 'WIRED')).toBe('WIRED reports on ICE');
  });

  it('keeps the title when there is no source, or nothing would be left', () => {
    expect(stripSourceSuffix('Headline - WIRED', null)).toBe('Headline - WIRED');
    expect(stripSourceSuffix('WIRED', 'WIRED')).toBe('WIRED');
  });
});
