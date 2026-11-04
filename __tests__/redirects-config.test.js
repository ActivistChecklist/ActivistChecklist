import { describe, it, expect } from 'vitest';
import { REDIRECTS, toApacheRedirectLine } from '@/lib/redirects.config.cjs';

describe('toApacheRedirectLine', () => {
  it('matches an exact source only, with or without the trailing slash', () => {
    expect(toApacheRedirectLine({ source: '/government', destination: '/federal' })).toBe(
      'RedirectMatch 301 ^/government/?$ /federal',
    );
  });

  it('sends an exact source to the home page without a doubled slash', () => {
    // A prefix Redirect would append the trailing slash of /resources/ to "/".
    expect(toApacheRedirectLine({ source: '/resources', destination: '/' })).toBe(
      'RedirectMatch 301 ^/resources/?$ /',
    );
  });

  it('escapes regex characters in an exact source', () => {
    expect(
      toApacheRedirectLine({ source: '/images/flyer.pdf', destination: '/files/flyer.pdf' }),
    ).toBe('RedirectMatch 301 ^/images/flyer\\.pdf/?$ /files/flyer.pdf');
  });

  it('uses 302 for temporary redirects', () => {
    expect(toApacheRedirectLine({ source: '/a', destination: '/b', permanent: false })).toBe(
      'RedirectMatch 302 ^/a/?$ /b',
    );
  });

  it('turns a /:path* pair into an Apache path prefix', () => {
    expect(toApacheRedirectLine({ source: '/es/files/:path*', destination: '/files/:path*' })).toBe(
      'Redirect 301 /es/files /files',
    );
  });

  it('rejects a prefix on only one side', () => {
    expect(() =>
      toApacheRedirectLine({ source: '/es/files/:path*', destination: '/files/' }),
    ).toThrow(/both sides/);
  });

  it('rejects other Next.js patterns that Apache would treat literally', () => {
    expect(() =>
      toApacheRedirectLine({ source: '/blog/:slug', destination: '/news/:slug' }),
    ).toThrow(/only exact paths/);
    expect(() =>
      toApacheRedirectLine({ source: '/:locale(es)/files/:path*', destination: '/files/:path*' }),
    ).toThrow(/only exact paths/);
  });

  it('accepts every configured redirect', () => {
    for (const r of REDIRECTS) expect(() => toApacheRedirectLine(r)).not.toThrow();
  });
});
