import { describe, it, expect } from 'vitest';
import {
  isNavItemActive,
  findActiveSection,
  isSubItemActive,
  navigationConfig,
  footerConfig,
  SECURITY_CHECKLISTS,
  SOCIAL_LINKS,
  NAV_ITEMS,
} from '../config/navigation';

describe('isNavItemActive', () => {
  it('returns false for items with hash href', () => {
    expect(isNavItemActive({ href: '#section', type: 'link' }, '/about')).toBe(false);
  });

  it('returns true for link-type item with exact match', () => {
    expect(isNavItemActive({ href: '/about', type: 'link' }, '/about')).toBe(true);
  });

  it('returns true for HOME when pathname is empty string', () => {
    expect(isNavItemActive({ href: '/', type: 'link' }, '')).toBe(true);
  });

  it('returns false for link-type item with no match', () => {
    expect(isNavItemActive({ href: '/about', type: 'link' }, '/contact')).toBe(false);
  });

  it('returns true for dropdown when sub-item href matches', () => {
    const dropdown = {
      type: 'dropdown',
      items: [{ href: '/essentials' }, { href: '/protest' }],
    };
    expect(isNavItemActive(dropdown, '/essentials')).toBe(true);
  });

  it('returns true for dropdown when pathname starts with sub-item href', () => {
    const dropdown = {
      type: 'dropdown',
      items: [{ href: '/essentials' }],
    };
    expect(isNavItemActive(dropdown, '/essentials/something')).toBe(true);
  });

  it('returns false for dropdown when no sub-item matches', () => {
    const dropdown = {
      type: 'dropdown',
      items: [{ href: '/essentials' }, { href: '/protest' }],
    };
    expect(isNavItemActive(dropdown, '/about')).toBe(false);
  });

  it('HOME does not match unrelated paths via / prefix', () => {
    // The / href for HOME should only match "/" or "" exactly
    expect(isNavItemActive(NAV_ITEMS.HOME, '/essentials')).toBe(false);
  });
});

describe('findActiveSection', () => {
  it('returns HOME for pathname /', () => {
    const result = findActiveSection('/');
    expect(result).toBeDefined();
    expect(result.key).toBe('home');
  });

  it('returns SECURITY_CHECKLISTS for a checklist path', () => {
    const result = findActiveSection('/essentials');
    expect(result).toBeDefined();
    expect(result.key).toBe('checklists');
  });

  it('returns undefined for unrecognized path', () => {
    const result = findActiveSection('/nonexistent-page-xyz');
    expect(result).toBeUndefined();
  });
});

describe('isSubItemActive', () => {
  it('returns false for items with hash href', () => {
    expect(isSubItemActive({ href: '#top' }, '/about')).toBe(false);
  });

  it('returns true for exact match', () => {
    expect(isSubItemActive({ href: '/essentials' }, '/essentials')).toBe(true);
  });

  it('returns true when pathname starts with href', () => {
    expect(isSubItemActive({ href: '/essentials' }, '/essentials/something')).toBe(true);
  });

  it('returns false when no match', () => {
    expect(isSubItemActive({ href: '/essentials' }, '/protest')).toBe(false);
  });

  it('does not match / as prefix for all paths', () => {
    // href '/' should only match exactly '/', not '/essentials'
    expect(isSubItemActive({ href: '/' }, '/essentials')).toBe(false);
  });
});

describe('Navigation config structure', () => {
  it('mainNav has expected number of items', () => {
    expect(navigationConfig.mainNav).toBeInstanceOf(Array);
    expect(navigationConfig.mainNav.length).toBe(5);
  });

  it('all mainNav items have key property', () => {
    for (const item of navigationConfig.mainNav) {
      expect(item.key, `Nav item missing key`).toBeDefined();
    }
  });

  it('SECURITY_CHECKLISTS items have required properties', () => {
    for (const item of SECURITY_CHECKLISTS.items) {
      expect(item.title, `Item ${item.key} missing title`).toBeDefined();
      expect(item.href, `Item ${item.key} missing href`).toBeDefined();
      expect(item.description, `Item ${item.key} missing description`).toBeDefined();
      expect(item.icon, `Item ${item.key} missing icon`).toBeDefined();
    }
  });

  it('footer has two sections', () => {
    expect(footerConfig.sections).toHaveLength(2);
  });

  it('social links have required properties', () => {
    for (const link of Object.values(SOCIAL_LINKS)) {
      expect(link.href).toBeDefined();
      expect(link.label).toBeDefined();
      expect(link.icon).toBeDefined();
      expect(link.ariaLabel).toBeDefined();
    }
  });

  it('logo config is valid', () => {
    expect(navigationConfig.logo.href).toBe('/');
    expect(navigationConfig.logo.label).toBeDefined();
    expect(navigationConfig.logo.image).toBeDefined();
  });
});
