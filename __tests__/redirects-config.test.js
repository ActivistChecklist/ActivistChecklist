import { describe, it, expect } from 'vitest';
import { REDIRECTS, toApacheRedirectLine, redirectTarget } from '@/lib/redirects.config.cjs';

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

describe('redirectTarget', () => {
  const redirects = [
    { source: '/resources', destination: '/' },
    { source: '/es/files/:path*', destination: '/files/:path*' },
  ];

  it('follows an exact source with or without the trailing slash', () => {
    expect(redirectTarget('/resources', redirects)).toBe('/');
    expect(redirectTarget('/resources/', redirects)).toBe('/');
  });

  it('does not treat an exact source as a prefix', () => {
    expect(redirectTarget('/resources/zines/', redirects)).toBeNull();
    expect(redirectTarget('/resourcesx/', redirects)).toBeNull();
  });

  it('carries the rest of the path over for a /:path* source', () => {
    expect(redirectTarget('/es/files/zines/a.pdf', redirects)).toBe('/files/zines/a.pdf');
    expect(redirectTarget('/es/filesx/a.pdf', redirects)).toBeNull();
  });

  it('covers the retired pages old links still point at', () => {
    expect(redirectTarget('/resources/')).toBe('/');
    expect(redirectTarget('/organizing/')).toBe('/action-safety/');
  });
});
