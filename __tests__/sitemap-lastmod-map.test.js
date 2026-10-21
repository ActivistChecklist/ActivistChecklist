import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { lookupContentLastmod, buildLastmodByPath } = require('../scripts/sitemap-lastmod-map.cjs');

describe('lookupContentLastmod', () => {
  it('maps Spanish URLs to the same lastmod as English', () => {
    const map = new Map([
      ['/signal/', '2026-04-03'],
      ['/', '2026-01-01'],
    ]);
    expect(lookupContentLastmod('/es/signal/', map)).toBe('2026-04-03');
    expect(lookupContentLastmod('/signal/', map)).toBe('2026-04-03');
    expect(lookupContentLastmod('/es/', map)).toBe('2026-01-01');
  });

  it('maps French URLs to the same lastmod as English', () => {
    const map = new Map([
      ['/signal/', '2026-04-03'],
      ['/', '2026-01-01'],
    ]);
    expect(lookupContentLastmod('/fr/signal/', map)).toBe('2026-04-03');
    expect(lookupContentLastmod('/fr/', map)).toBe('2026-01-01');
  });

  it('returns null when unknown', () => {
    expect(lookupContentLastmod('/contact/', new Map())).toBe(null);
  });
});

describe('buildLastmodByPath', () => {
  it('includes at least one guide path with a date string', () => {
    const map = buildLastmodByPath();
    expect(map.get('/signal/')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
