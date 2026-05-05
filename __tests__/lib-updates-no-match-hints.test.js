import { describe, it, expect } from 'vitest';
import { looksLikeWindowsLaptopQuery } from '../lib/updates/no-match-hints';

describe('looksLikeWindowsLaptopQuery', () => {
  it('returns false for empty / null / non-string inputs', () => {
    expect(looksLikeWindowsLaptopQuery('')).toBe(false);
    expect(looksLikeWindowsLaptopQuery(null)).toBe(false);
    expect(looksLikeWindowsLaptopQuery(undefined)).toBe(false);
    expect(looksLikeWindowsLaptopQuery(42)).toBe(false);
  });

  it('matches major OEM brand names (case-insensitive)', () => {
    expect(looksLikeWindowsLaptopQuery('Dell XPS 13')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('lenovo thinkpad t14')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('ASUS ZenBook 14')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('hp pavilion')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('Microsoft Surface Pro 9')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('Razer Blade 16')).toBe(true);
  });

  it('matches product-line keywords without the brand', () => {
    expect(looksLikeWindowsLaptopQuery('thinkpad x1 carbon')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('alienware m18')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('ideapad slim')).toBe(true);
  });

  it('matches multi-word brand patterns', () => {
    expect(looksLikeWindowsLaptopQuery('LG Gram 17')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('hewlett-packard probook')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('hewlett packard envy')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('samsung galaxy book 4')).toBe(true);
    expect(looksLikeWindowsLaptopQuery('samsung book pro')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(looksLikeWindowsLaptopQuery('iPhone 15')).toBe(false);
    expect(looksLikeWindowsLaptopQuery('Pixel 9 Pro')).toBe(false);
    expect(looksLikeWindowsLaptopQuery('Galaxy S24')).toBe(false);
    expect(looksLikeWindowsLaptopQuery('iPad Pro')).toBe(false);
  });

  it('does not false-match substrings', () => {
    // "hp" must be a whole word — "shopping", "happy", "shipped" should not match.
    expect(looksLikeWindowsLaptopQuery('shopping cart')).toBe(false);
    expect(looksLikeWindowsLaptopQuery('happy laptop')).toBe(false);
    // "blade" hits because it's a Razer product line — that's intended even without
    // the brand. But "bladed" should not match.
    expect(looksLikeWindowsLaptopQuery('bladed device')).toBe(false);
    // "Yoga" matches — Lenovo Yoga is intended. But generic "yoga mat" should not
    // appear in this UI; the test documents the boundary.
    expect(looksLikeWindowsLaptopQuery('yogabear')).toBe(false);
  });
});
