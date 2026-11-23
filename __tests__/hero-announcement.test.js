import { describe, it, expect } from 'vitest';
import { pickHeroAnnouncement } from '../lib/hero-announcement';

const NOW = Date.parse('2026-11-13T12:00:00Z');

describe('pickHeroAnnouncement', () => {
  it('returns the newest major entry when it is recent', () => {
    const entries = [
      { slug: 'minor-fix', type: 'minor', created_at: '2026-11-12' },
      { slug: 'new-page', type: 'major', created_at: '2026-11-06' },
      { slug: 'older-major', type: 'major', created_at: '2026-10-01' },
    ];
    expect(pickHeroAnnouncement(entries, NOW)?.slug).toBe('new-page');
  });

  it('returns null when the newest major entry is past the cutoff', () => {
    const entries = [
      { slug: 'minor-fix', type: 'minor', created_at: '2026-11-12' },
      { slug: 'old-major', type: 'major', created_at: '2026-09-01' },
    ];
    expect(pickHeroAnnouncement(entries, NOW)).toBeNull();
  });

  it('keeps an entry on the last day of the window and drops it the day after', () => {
    const entries = [{ slug: 'edge', type: 'major', created_at: '2026-10-14T12:00:00Z' }];
    expect(pickHeroAnnouncement(entries, NOW, 30)?.slug).toBe('edge');
    expect(pickHeroAnnouncement(entries, NOW + 24 * 60 * 60 * 1000, 30)).toBeNull();
  });

  it('returns null when there is no major entry', () => {
    expect(pickHeroAnnouncement([{ type: 'minor', created_at: '2026-11-12' }], NOW)).toBeNull();
    expect(pickHeroAnnouncement([], NOW)).toBeNull();
  });

  it('returns null when the major entry has no usable date', () => {
    expect(pickHeroAnnouncement([{ type: 'major' }], NOW)).toBeNull();
    expect(pickHeroAnnouncement([{ type: 'major', created_at: 'soon' }], NOW)).toBeNull();
  });
});
