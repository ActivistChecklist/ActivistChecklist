import { Link as IntlLink } from '@/i18n/navigation';
import {
  defaultExternalTarget,
  isExternalHref,
  resolveLocaleAwareHref,
} from '@/lib/locale-aware-href';

/**
 * External: http(s), //, mailto, tel → native anchor (paywall transform for http).
 * Otherwise → next-intl Link (locale prefix for /es/… vs English).
 */
export default function Link({ href, children, target: targetProp, rel: relProp, ...props }) {
  if (typeof href !== 'string') {
    return (
      <IntlLink href={href} target={targetProp} rel={relProp} {...props}>
        {children}
      </IntlLink>
    );
  }
  const resolvedHref = resolveLocaleAwareHref(href);

  // Static files (anything with an extension) must skip IntlLink: next-intl's
  // client-side routing strips the extension and 404s. Apache serves these
  // directly from /public, so a native anchor is correct.
  if (/\.[a-z0-9]+(?:[?#]|$)/i.test(href)) {
    const target = targetProp ?? '_blank';
    const rel = relProp ?? (target === '_blank' ? 'noopener noreferrer' : undefined);
    return (
      <a href={resolvedHref} target={target} rel={rel} {...props}>
        {children}
      </a>
    );
  }

  if (isExternalHref(href)) {
    const target = targetProp ?? defaultExternalTarget(href);
    const rel =
      relProp ?? (target === '_blank' ? 'noopener noreferrer' : undefined);
    return (
      <a href={resolvedHref} target={target} rel={rel} {...props}>
        {children}
      </a>
    );
  }
  return (
    <IntlLink href={resolvedHref} target={targetProp} rel={relProp} {...props}>
      {children}
    </IntlLink>
  );
}
