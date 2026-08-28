import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Exclude draft preview routes so next-intl does not rewrite /preview/*
  matcher: ['/((?!api|_next|_vercel|keystatic|preview|.*\\..*).*)'],
};
