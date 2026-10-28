import { describe, it, expect } from 'vitest';
import { REDIRECTS, toApacheRedirectLine } from '@/lib/redirects.config.cjs';

describe('toApacheRedirectLine', () => {
  it('writes exact redirects as-is', () => {
    expect(toApacheRedirectLine({ source: '/government', destination: '/federal' })).toBe(
      'Redirect 301 /government /federal',
    );
  });

  it('uses 302 for temporary redirects', () => {
    expect(toApacheRedirectLine({ source: '/a', destination: '/b', permanent: false })).toBe(
      'Redirect 302 /a /b',
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
