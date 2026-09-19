import { describe, it, expect } from 'vitest';
import {
  detectPlatformKey,
  parsePlatformHeader,
  splitOnChevron,
  isRtlLocale,
  getArrow,
  RIGHT_ARROW,
  LEFT_ARROW,
} from '@/lib/menu-path';

describe('parsePlatformHeader', () => {
  it('strips a leading "On" before a known platform', () => {
    expect(parsePlatformHeader('On iPhone')).toEqual({
      key: 'iphone',
      displayLabel: 'iPhone',
    });
    expect(parsePlatformHeader('On Android')).toEqual({
      key: 'android',
      displayLabel: 'Android',
    });
    expect(parsePlatformHeader('On Windows')).toEqual({
      key: 'windows',
      displayLabel: 'Windows',
    });
  });

  it('matches Mac variants', () => {
    expect(parsePlatformHeader('On Mac')).toEqual({ key: 'mac', displayLabel: 'Mac' });
    expect(parsePlatformHeader('On macOS')).toEqual({ key: 'mac', displayLabel: 'macOS' });
    expect(parsePlatformHeader('On Mac OS')).toEqual({ key: 'mac', displayLabel: 'Mac OS' });
  });

  it('matches a bare platform name without "On"', () => {
    expect(parsePlatformHeader('iPhone')).toEqual({ key: 'iphone', displayLabel: 'iPhone' });
  });

  it('passes through unknown labels unchanged', () => {
    expect(parsePlatformHeader('On Linux')).toEqual({ key: null, displayLabel: 'On Linux' });
    expect(parsePlatformHeader('Anywhere')).toEqual({ key: null, displayLabel: 'Anywhere' });
  });

  it('returns null for empty or non-string input', () => {
    expect(parsePlatformHeader('')).toBeNull();
    expect(parsePlatformHeader(null)).toBeNull();
    expect(parsePlatformHeader(undefined)).toBeNull();
  });

  it('is case-insensitive on the leading "On"', () => {
    expect(parsePlatformHeader('on iphone')).toEqual({ key: 'iphone', displayLabel: 'iphone' });
    expect(parsePlatformHeader('  On Android  ')).toEqual({ key: 'android', displayLabel: 'Android' });
  });
});

describe('detectPlatformKey', () => {
  it('returns the platform key when matched', () => {
    expect(detectPlatformKey('On iPhone')).toBe('iphone');
    expect(detectPlatformKey('On Android')).toBe('android');
    expect(detectPlatformKey('On Windows')).toBe('windows');
    expect(detectPlatformKey('On macOS')).toBe('mac');
  });

  it('returns null for unknown labels', () => {
    expect(detectPlatformKey('On Linux')).toBeNull();
    expect(detectPlatformKey('')).toBeNull();
    expect(detectPlatformKey(null)).toBeNull();
  });
});

describe('splitOnChevron', () => {
  it('splits on whitespace-flanked chevrons', () => {
    expect(splitOnChevron('Settings > Privacy > Lock')).toEqual([
      'Settings',
      'Privacy',
      'Lock',
    ]);
  });

  it('splits on whitespace-flanked unicode arrows', () => {
    expect(splitOnChevron('Settings → Privacy → Lock')).toEqual([
      'Settings',
      'Privacy',
      'Lock',
    ]);
  });

  it('splits on a mix of > and → in the same run', () => {
    expect(splitOnChevron('A > B → C > D')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns single segment when no separator present', () => {
    expect(splitOnChevron('Just one')).toEqual(['Just one']);
  });

  it('preserves leading and trailing whitespace as empty segments', () => {
    expect(splitOnChevron(' A > B > ')).toEqual([' A', 'B', '']);
  });

  it('does not split on chevrons embedded in words', () => {
    expect(splitOnChevron('count>5 means many')).toEqual(['count>5 means many']);
  });

  it('passes through non-strings unchanged', () => {
    expect(splitOnChevron(null)).toEqual([null]);
    expect(splitOnChevron(42)).toEqual([42]);
  });
});

describe('isRtlLocale', () => {
  it('detects known RTL locales', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('he')).toBe(true);
    expect(isRtlLocale('fa-IR')).toBe(true);
    expect(isRtlLocale('AR')).toBe(true);
  });

  it('returns false for LTR locales', () => {
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('es')).toBe(false);
    expect(isRtlLocale('en-US')).toBe(false);
  });

  it('handles missing locale safely', () => {
    expect(isRtlLocale(undefined)).toBe(false);
    expect(isRtlLocale('')).toBe(false);
  });
});

describe('getArrow', () => {
  it('returns the right arrow for LTR', () => {
    expect(getArrow(false)).toBe(RIGHT_ARROW);
  });

  it('returns the left arrow for RTL', () => {
    expect(getArrow(true)).toBe(LEFT_ARROW);
  });
});
