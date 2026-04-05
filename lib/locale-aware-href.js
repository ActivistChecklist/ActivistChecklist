import { applyPaywallBypassHref } from './paywall-bypass-url';

/**
 * True when the href should render as a plain <a>, not next-intl Link.
 * Used by Link (components/Link.js), ButtonEmbed.
 */
export function isExternalHref(href) {
  if (typeof href !== 'string') return false;
  return (
    href.startsWith('http') ||
    href.startsWith('//') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  );
}

/**
 * href after paywall bypass for http(s); unchanged for mailto, tel, //, internal paths.
 */
export function resolveLocaleAwareHref(href) {
  if (typeof href !== 'string') return href;
  return href.startsWith('http') ? applyPaywallBypassHref(href) : href;
}

/**
 * Default target for external links when the caller does not pass `target`.
 */
export function defaultExternalTarget(href) {
  if (typeof href !== 'string') return undefined;
  if (href.startsWith('http') || href.startsWith('//')) return '_blank';
  return undefined;
}
