import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  diffSofaWatchlist,
  isVirtualMacIdentifier,
  mergeLegacyAndSofa,
  stripDocKeys,
} from '../lib/updates/mac-data';
import { inferMacProductLine, deriveMacProductsFromSofa } from '../lib/updates/sofa-macos';

const REPO_ROOT = path.resolve(__dirname, '..');
const LEGACY_PATH = path.join(REPO_ROOT, 'data', 'legacy-mac-models.json');
const WATCHLIST_PATH = path.join(REPO_ROOT, 'data', 'sofa-watchlist.json');

describe('isVirtualMacIdentifier', () => {
  it('flags VirtualMac and VMM identifiers', () => {
    expect(isVirtualMacIdentifier('VirtualMac2,1')).toBe(true);
    expect(isVirtualMacIdentifier('VMM-x86_64')).toBe(true);
  });

  it('returns false for real Mac identifiers', () => {
    expect(isVirtualMacIdentifier('MacBookPro15,1')).toBe(false);
    expect(isVirtualMacIdentifier('iMac18,3')).toBe(false);
    expect(isVirtualMacIdentifier('Mac16,1')).toBe(false);
  });
});

describe('stripDocKeys', () => {
  it('removes underscore-prefixed metadata keys', () => {
    const out = stripDocKeys({ _README: 'docs', _meta: 1, 'MacBookPro15,1': { x: 1 } });
    expect(out).toEqual({ 'MacBookPro15,1': { x: 1 } });
  });

  it('returns an empty object for non-objects', () => {
    expect(stripDocKeys(null)).toEqual({});
    expect(stripDocKeys(undefined)).toEqual({});
    expect(stripDocKeys('not an object')).toEqual({});
  });
});

describe('diffSofaWatchlist', () => {
  it('flags watchlist entries missing from SOFA as dropped', () => {
    const out = diffSofaWatchlist(['Mac16,1', 'Mac16,2'], ['Mac16,1', 'MacBookPro15,1']);
    expect(out.dropped).toEqual(['MacBookPro15,1']);
  });

  it('flags SOFA entries missing from watchlist as novel', () => {
    const out = diffSofaWatchlist(['Mac16,1', 'Mac17,9'], ['Mac16,1']);
    expect(out.novel).toEqual(['Mac17,9']);
  });

  it('filters virtual-machine identifiers out of novel', () => {
    const out = diffSofaWatchlist(['Mac16,1', 'VirtualMac2,1', 'VMM-x86_64'], ['Mac16,1']);
    expect(out.novel).toEqual([]);
  });

  it('returns sorted lists for stable output', () => {
    const out = diffSofaWatchlist(['Mac17,9', 'Mac17,2'], ['MacBookPro15,1', 'iMac19,1']);
    expect(out.novel).toEqual(['Mac17,2', 'Mac17,9']);
    expect(out.dropped).toEqual(['MacBookPro15,1', 'iMac19,1']);
  });

  it('returns empty arrays when SOFA and watchlist match exactly', () => {
    const out = diffSofaWatchlist(['Mac16,1'], ['Mac16,1']);
    expect(out).toEqual({ dropped: [], novel: [] });
  });
});

describe('mergeLegacyAndSofa', () => {
  it('SOFA wins on identifier collisions', () => {
    const legacy = { 'MacBookPro15,1': { MarketingName: 'legacy' } };
    const sofa = { 'MacBookPro15,1': { MarketingName: 'sofa' } };
    expect(mergeLegacyAndSofa(legacy, sofa)['MacBookPro15,1'].MarketingName).toBe('sofa');
  });

  it('keeps legacy-only entries that SOFA does not provide', () => {
    const legacy = { 'iMac14,1': { MarketingName: 'legacy iMac' } };
    const sofa = { 'Mac16,1': { MarketingName: 'sofa Mac' } };
    expect(mergeLegacyAndSofa(legacy, sofa)).toEqual({
      'iMac14,1': { MarketingName: 'legacy iMac' },
      'Mac16,1': { MarketingName: 'sofa Mac' },
    });
  });

  it('strips doc pseudo-keys from both inputs', () => {
    const legacy = { _README: 'docs', 'iMac14,1': { MarketingName: 'A' } };
    const sofa = { _meta: 'x', 'Mac16,1': { MarketingName: 'B' } };
    expect(mergeLegacyAndSofa(legacy, sofa)).toEqual({
      'iMac14,1': { MarketingName: 'A' },
      'Mac16,1': { MarketingName: 'B' },
    });
  });
});

describe('legacy-mac-models.json shape', () => {
  const raw = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
  const entries = Object.entries(stripDocKeys(raw));

  it('has at least one entry (otherwise the file is pointless)', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every entry has MarketingName + OSVersions and matches a known product line', () => {
    for (const [id, info] of entries) {
      expect(typeof info.MarketingName).toBe(`string`);
      expect(info.MarketingName.length).toBeGreaterThan(0);
      expect(Array.isArray(info.OSVersions)).toBe(true);
      expect(info.OSVersions.length).toBeGreaterThan(0);
      expect(info.OSVersions.every((v) => Number.isInteger(v) && v > 0)).toBe(true);
      // Marketing name must start with a recognised product line prefix —
      // otherwise deriveMacProductsFromSofa would silently drop the entry.
      expect(inferMacProductLine(info.MarketingName), `unrecognised line for ${id}`).not.toBeNull();
    }
  });

  it('every entry survives the SOFA pipeline (parses to a real product release)', () => {
    const products = deriveMacProductsFromSofa(stripDocKeys(raw));
    const totalReleases = products.reduce((sum, p) => sum + p.releases.length, 0);
    expect(totalReleases).toBe(entries.length);
  });
});

describe('sofa-watchlist.json shape', () => {
  const raw = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));

  it('has an `expected` array of identifier strings', () => {
    expect(Array.isArray(raw.expected)).toBe(true);
    expect(raw.expected.length).toBeGreaterThan(0);
    expect(raw.expected.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('contains no virtual-machine identifiers (those are not user-facing devices)', () => {
    expect(raw.expected.some(isVirtualMacIdentifier)).toBe(false);
  });

  it('has no duplicates', () => {
    expect(new Set(raw.expected).size).toBe(raw.expected.length);
  });
});
