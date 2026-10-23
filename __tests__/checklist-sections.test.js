import { describe, expect, it } from 'vitest';
import {
  findPairedExplainer,
  findSectionForGuide,
  findSectionForPage,
  getNextInSection,
  isOlderThanMonths,
  readingMinutes,
  slugFromHref,
} from '../lib/checklist-sections';
import navData from '../config/navigation.json';

const SECTIONS = [
  {
    key: 'basics',
    items: ['essentials', 'signal', 'whatsapp'],
    featured: ['essentials', 'signal'],
  },
  {
    key: 'goingOut',
    items: ['protest', 'ice', 'travel', 'secondary', 'action'],
    featured: ['protest', 'ice'],
  },
  { key: 'organizing', items: ['organizing', 'research'], featured: ['party'] },
];

describe('slugFromHref', () => {
  it('strips leading and trailing slashes', () => {
    expect(slugFromHref('/signal/')).toBe('signal');
    expect(slugFromHref('signal')).toBe('signal');
    expect(slugFromHref(undefined)).toBe('');
  });
});

describe('findSectionForGuide', () => {
  it('finds the section that lists the guide', () => {
    expect(findSectionForGuide(SECTIONS, 'travel').key).toBe('goingOut');
  });

  it('returns null for a guide in no section', () => {
    expect(findSectionForGuide(SECTIONS, 'nope')).toBeNull();
  });

  it('ignores featured non-checklists, so a how-to has no section', () => {
    expect(findSectionForGuide(SECTIONS, 'party')).toBeNull();
  });
});

describe('findSectionForPage', () => {
  const sections = [
    { key: 'basics', featured: [], reads: ['vpn'] },
    { key: 'targeted', featured: [], reads: ['police-door-poster'] },
    { key: 'organizing', featured: ['party'], reads: [] },
  ];
  const items = {
    vpn: { href: '/vpn/' },
    'police-door-poster': { href: '/police/' },
    party: { href: '/party/' },
    about: { href: '/about/' },
  };

  it('finds a page listed in reads', () => {
    expect(findSectionForPage(sections, items, 'vpn').key).toBe('basics');
  });

  it('matches by URL slug when the item key differs', () => {
    expect(findSectionForPage(sections, items, 'police').key).toBe('targeted');
  });

  it('finds a featured how-to', () => {
    expect(findSectionForPage(sections, items, 'party').key).toBe('organizing');
  });

  it('prefers the section that features a page over an earlier one that lists it in reads', () => {
    const withPartyRead = [{ key: 'basics', featured: [], reads: ['vpn', 'party'] }, ...sections];
    expect(findSectionForPage(withPartyRead, items, 'party').key).toBe('organizing');
    expect(findSectionForPage(withPartyRead, items, 'vpn').key).toBe('basics');
  });

  it('returns null for pages in no section or unknown slugs', () => {
    expect(findSectionForPage(sections, items, 'about')).toBeNull();
    expect(findSectionForPage(sections, items, 'nope')).toBeNull();
  });
});

describe('getNextInSection', () => {
  it('puts featured checklists first and skips the current guide', () => {
    expect(getNextInSection(SECTIONS[1], 'travel', 3)).toEqual(['protest', 'ice', 'secondary']);
  });

  it('skips the current guide when it is featured', () => {
    expect(getNextInSection(SECTIONS[0], 'signal')).toEqual(['essentials', 'whatsapp']);
  });

  it('never suggests featured items that are not checklists', () => {
    expect(getNextInSection(SECTIONS[2], 'organizing')).toEqual(['research']);
  });

  it('returns nothing without a section', () => {
    expect(getNextInSection(null, 'signal')).toEqual([]);
  });
});

describe('findPairedExplainer', () => {
  it('finds the explainer paired with a guide', () => {
    const items = { a: { pairsWith: 'signal' }, b: {} };
    expect(findPairedExplainer(items, 'signal')).toBe('a');
    expect(findPairedExplainer(items, 'travel')).toBeNull();
  });
});

describe('readingMinutes', () => {
  it('rounds to the nearest minute with a floor of one', () => {
    expect(readingMinutes('word '.repeat(460))).toBe(2);
    expect(readingMinutes('short')).toBe(1);
    expect(readingMinutes('')).toBe(1);
  });

  it('does not count JSX tags or link targets as words', () => {
    const tags = '<ChecklistItem slug="a-very-long-slug" /> '.repeat(500);
    const links = '[x](https://example.com/a/b/c) '.repeat(10);
    expect(readingMinutes(tags + links)).toBe(1);
  });
});

describe('isOlderThanMonths', () => {
  const now = new Date('2026-10-15');

  it('flags a date past the cutoff', () => {
    expect(isOlderThanMonths('2025-02-24', 12, now)).toBe(true);
  });

  it('does not flag a recent date', () => {
    expect(isOlderThanMonths('2026-01-28', 12, now)).toBe(false);
  });

  it('does not flag missing or invalid dates', () => {
    expect(isOlderThanMonths(undefined, 12, now)).toBe(false);
    expect(isOlderThanMonths('not a date', 12, now)).toBe(false);
  });
});

// Guards the config itself: a typo in navigation.json would otherwise just
// drop an item from the homepage without any error.
describe('checklistSections config', () => {
  const sections = navData.checklistSections;
  const itemKeys = new Set(Object.keys(navData.items));

  it('only references items that exist', () => {
    for (const section of sections) {
      for (const key of [...section.items, ...section.featured, ...section.reads]) {
        expect(itemKeys, `${section.key} -> ${key}`).toContain(key);
      }
    }
  });

  it('lists every checklist exactly once', () => {
    const listed = sections.flatMap((section) => section.items);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('only features checklists from the same section, or non-checklist items', () => {
    const allChecklists = new Set(sections.flatMap((section) => section.items));
    for (const section of sections) {
      for (const key of section.featured) {
        if (allChecklists.has(key)) expect(section.items).toContain(key);
      }
    }
  });
});
