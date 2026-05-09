// @ts-nocheck
import { NotFoundInner } from '@/components/pages/NotFoundContent';

/**
 * Locale-scoped 404. Inherits locale + dir + next-intl context from
 * [locale]/layout.tsx, so useLocale()/usePathname() resolve correctly
 * (prevents /ar/ar/... loops from the language switcher on missing pages).
 */
export default function LocaleNotFound() {
  return <NotFoundInner />;
}
