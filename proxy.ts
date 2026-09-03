import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 renamed the `middleware` file convention to `proxy`. next-intl has
// no separate entry point for it: `next-intl/middleware` is still the import.
// Note `proxy` always runs on the Node runtime; the edge runtime is not
// available here, and next-intl's locale negotiation does not need it.
const proxy = createMiddleware(routing);

export default proxy;

export const config = {
  // Exclude draft preview routes so next-intl does not rewrite /preview/*
  matcher: ['/((?!api|_next|_vercel|keystatic|preview|.*\\..*).*)'],
};
