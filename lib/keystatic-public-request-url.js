import { NextRequest } from 'next/server';

/**
 * Keystatic sets GitHub OAuth `redirect_uri` from `new URL(request.url).origin`.
 * Behind a reverse proxy, Node often sees an internal host (e.g. 127.0.0.1), which
 * breaks OAuth. Prefer standard forwarded headers; in production, fall back to
 * NEXT_PUBLIC_SITE_URL when the request origin does not match the public site.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {import('next/server').NextRequest}
 */
export function rewriteRequestUrlForPublicOrigin(request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const siteUrlRaw = process.env.NEXT_PUBLIC_SITE_URL;

  let base = null;
  if (forwardedHost) {
    const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
    base = `${proto}://${forwardedHost.split(',')[0].trim()}`;
  } else if (process.env.NODE_ENV === 'production' && siteUrlRaw) {
    let site;
    try {
      site = new URL(siteUrlRaw);
    } catch {
      return request;
    }
    const local =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    const wrongOrigin = url.origin !== site.origin;
    if (local || wrongOrigin) {
      base = site.origin;
    }
  }

  if (!base) return request;
  const rewritten = new Request(`${base}${url.pathname}${url.search}`, request);
  return new NextRequest(rewritten);
}
