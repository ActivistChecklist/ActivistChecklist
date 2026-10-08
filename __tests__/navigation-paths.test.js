import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, SECURITY_CHECKLISTS, STATIC_PATHS } from '../config/navigation';

function collectNavHrefs() {
  const hrefs = [];
  for (const item of Object.values(NAV_ITEMS)) {
    if (item.href) hrefs.push(item.href);
  }
  hrefs.push(SECURITY_CHECKLISTS.href);
  for (const v of Object.values(STATIC_PATHS)) {
    hrefs.push(v);
  }
  return hrefs;
}

describe('Navigation paths (config/navigation.json)', () => {
  const allHrefs = collectNavHrefs();

  it('has hrefs defined', () => {
    expect(allHrefs.length).toBeGreaterThan(0);
  });

  it('all paths are strings starting with /', () => {
    for (const value of allHrefs) {
      expect(value).toMatch(/^\//);
    }
  });

  it('has no duplicate href values among nav + static paths', () => {
    const duplicates = allHrefs.filter((v, i) => allHrefs.indexOf(v) !== i);
    expect(duplicates, `Duplicate hrefs: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('home is /', () => {
    expect(NAV_ITEMS.HOME.href).toBe('/');
  });

  it('checklist index matches menus.checklists', () => {
    expect(SECURITY_CHECKLISTS.href).toBe('/checklists/');
  });

  it('has expected checklist page hrefs', () => {
    expect(NAV_ITEMS.ESSENTIALS.href).toBe('/essentials/');
    expect(NAV_ITEMS.PROTEST.href).toBe('/protest/');
    expect(NAV_ITEMS.SIGNAL.href).toBe('/signal/');
    expect(NAV_ITEMS.DOXXING.href).toBe('/doxxing/');
    expect(NAV_ITEMS.TRAVEL.href).toBe('/travel/');
    expect(NAV_ITEMS.EMERGENCY.href).toBe('/emergency/');
    expect(NAV_ITEMS.SECONDARY.href).toBe('/secondary/');
    expect(NAV_ITEMS.SPYWARE.href).toBe('/spyware/');
    expect(NAV_ITEMS.RESEARCH.href).toBe('/research/');
    expect(NAV_ITEMS.ORGANIZING.href).toBe('/organizing/');
    expect(NAV_ITEMS.FEDERAL.href).toBe('/federal/');
    expect(NAV_ITEMS.ACTION.href).toBe('/action/');
  });

  it('has about-related hrefs', () => {
    expect(NAV_ITEMS.ABOUT.href).toBe('/about/');
    expect(NAV_ITEMS.CONTRIBUTE.href).toBe('/contribute/');
    expect(NAV_ITEMS.CONTACT.href).toBe('/contact/');
    expect(NAV_ITEMS.PRIVACY.href).toBe('/privacy/');
  });

  it('changelog and news', () => {
    expect(NAV_ITEMS.CHANGELOG.href).toBe('/changelog/');
    expect(NAV_ITEMS.NEWS.href).toBe('/news/');
  });

  it('PGP key file path ends with .asc', () => {
    expect(STATIC_PATHS.pgpKeyFile).toMatch(/\.asc$/);
  });
});
