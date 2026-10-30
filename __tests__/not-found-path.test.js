import { describe, it, expect } from 'vitest';
import { cleanedPathCandidates } from '@/lib/not-found-path';

// Inputs are real 404 paths from analytics, percent-encoded as location.pathname
// reports them.
describe('cleanedPathCandidates', () => {
  it.each([
    ['/ice/)before', '/ice/'],
    ['/essentials)', '/essentials/'],
    ['/essentials:', '/essentials/'],
    ['/signal/:', '/signal/'],
    ['/signal.', '/signal/'],
    ['/signal/,', '/signal/'],
    ["/signal/'", '/signal/'],
    ['/vpn/)', '/vpn/'],
    ['/checklists/%E2%80%9D', '/checklists/'],
    ['/essentials/%22/', '/essentials/'],
    ['/es/essentials/:8Seguridad', '/es/essentials/'],
    ['/es/onion/:IServicio', '/es/onion/'],
    ['/essentials/&link_id=10&can_id=abc', '/essentials/'],
  ])('strips trailing punctuation from %s', (input, expected) => {
    expect(cleanedPathCandidates(input)[0]).toBe(expected);
  });

  it.each([
    ['/travel%E2%81%A9', '/travel/'],
    ['/ice/%E2%81%A9', '/ice/'],
    ['/essentials/%C2%A0', '/essentials/'],
    ['/essentials%20', '/essentials/'],
    ['/protest/%20%E2%80%8B', '/protest/'],
    ['/%20travel/', '/travel/'],
  ])('strips whitespace and invisible characters from %s', (input, expected) => {
    expect(cleanedPathCandidates(input)[0]).toBe(expected);
  });

  it('cuts at whitespace inside the path rather than joining words', () => {
    expect(cleanedPathCandidates('/signal/%20https://activistchecklist.org/essentials/')[0]).toBe(
      '/signal/',
    );
    expect(cleanedPathCandidates('/es/checklists/%20en%20espa~nol')[0]).toBe('/es/checklists/');
  });

  it('offers a lowercased candidate for shouted paths', () => {
    expect(cleanedPathCandidates('/ESSENTIALS')).toEqual(['/essentials/']);
    expect(cleanedPathCandidates('/ESSENTIALS/')).toEqual(['/essentials/']);
    expect(cleanedPathCandidates('/ICE')).toEqual(['/ice/']);
  });

  it('tries the original case before the lowercased one', () => {
    expect(cleanedPathCandidates('/files/zines/signal-security-PRINT.pdf)')).toEqual([
      '/files/zines/signal-security-PRINT.pdf',
      '/files/zines/signal-security-print.pdf',
    ]);
  });

  it('keeps file extensions without adding a trailing slash', () => {
    expect(cleanedPathCandidates('/files/canary.txt.')).toEqual(['/files/canary.txt']);
  });

  it.each([
    '/private-keys',
    '/wp-admin',
    '/ahyrfpqoveck',
    '/signa',
    '/vpn',
    '/files/canary',
    '/essentials/',
  ])('returns nothing for %s, which has no junk to strip', (input) => {
    expect(cleanedPathCandidates(input)).toEqual([]);
  });

  it('never suggests the home page', () => {
    expect(cleanedPathCandidates('/)')).toEqual([]);
    expect(cleanedPathCandidates('/+')).toEqual([]);
    expect(cleanedPathCandidates("/%3E's")).toEqual([]);
  });

  it('only returns same-origin paths', () => {
    expect(cleanedPathCandidates('//evil.example/ice/)')).toEqual([]);
    expect(cleanedPathCandidates('/%2F%2Fevil.example/)')).toEqual([]);
    expect(cleanedPathCandidates('https://evil.example/ice/)')).toEqual([]);
    for (const c of cleanedPathCandidates('/https://securityconvergence.org/overview/')) {
      expect(c).toMatch(/^\/[^/]/);
    }
  });

  it('survives malformed percent-encoding', () => {
    expect(cleanedPathCandidates('/ice/%E0%A4%A)')).toEqual(['/ice/']);
  });
});
