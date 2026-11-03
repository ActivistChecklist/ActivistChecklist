'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import Link from '@/components/Link';
import { useNewsletterSubscribe } from '@/components/NewsletterSubscribe';
import { useAnalytics } from '@/hooks/use-analytics';
import {
  markNewsletterPromptDone,
  markNewsletterPromptSeen,
  readPromptState,
  shouldShowInlineCta,
} from '@/lib/newsletter-prompt';

/**
 * Inline newsletter CTA rendered between sections of a guide or page.
 * Auto-inserted by the page route (see lib/inline-cta-split.js) or placed
 * manually in MDX via <InlineCta />.
 *
 * Visual intent: Substack-style aside — dark surface in light mode so it
 * reads as a distinct break from surrounding checklist cards, primary-tinted
 * surface in dark mode. Compact (not banner-tall).
 *
 * How often it shows is decided in lib/newsletter-prompt.js. It renders only
 * after that client-side check, so returning readers don't see it flash in and
 * out, and visitors without JS (who couldn't submit it anyway) never get it.
 */
export default function InlineCta() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(true);
  const [visible, setVisible] = useState(false);
  const asideRef = useRef(null);
  const { status, error, subscribe } = useNewsletterSubscribe('inline');
  const { trackEvent } = useAnalytics();

  // Decided once per page load, so counting a view doesn't pull the box off
  // the page it was seen on.
  useEffect(() => {
    if (shouldShowInlineCta(readPromptState(), Date.now())) setVisible(true);
  }, []);

  // A view counts once at least half the box has been on screen.
  useEffect(() => {
    const el = asideRef.current;
    if (!visible || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markNewsletterPromptSeen();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const handleDismiss = () => {
    markNewsletterPromptDone();
    setVisible(false);
    trackEvent({ name: 'newsletter_prompt_dismissed', data: { context: 'inline' } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await subscribe(email);
    if (success) {
      setEmail('');
      setShowForm(false);
    }
  };

  if (!visible) return null;

  return (
    <aside
      ref={asideRef}
      data-inline-cta
      className="not-prose relative my-8 rounded-lg bg-foreground text-background dark:bg-primary/15 dark:text-foreground px-5 py-5 sm:px-6 sm:py-5 print:hidden"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('inlineCta.dismissLabel')}
        title={t('inlineCta.dismissLabel')}
        className="absolute top-2 right-2 rounded-md p-1.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex-1 min-w-0 pr-6 lg:pr-0">
          <p className="font-heading text-lg font-semibold leading-tight mb-1 text-balance">
            {t('inlineCta.heading')}
          </p>
          <p className="text-sm leading-snug opacity-90 dark:opacity-100 dark:text-muted-foreground">
            {t('inlineCta.description')}
          </p>
        </div>

        <div className="lg:max-w-xs lg:w-full lg:shrink-0">
          {status === 'error' && (
            <Alert variant="error" className="mb-2 text-sm newsletter-alert">
              {error}
            </Alert>
          )}
          {status === 'success' && !showForm && (
            <Alert variant="success" className="text-sm newsletter-alert">
              {t('newsletter.successShort')}
            </Alert>
          )}
          {showForm && (
            <>
              <form method="post" onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  type="email"
                  name="email"
                  aria-label={t('inlineCta.emailAriaLabel')}
                  placeholder={t('newsletter.placeholders.emailShort')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === 'loading'}
                  className="flex-1 text-foreground"
                />
                <Button type="submit" disabled={status === 'loading'} variant="default">
                  {status === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('inlineCta.buttonText')
                  )}
                </Button>
              </form>
              <p className="mt-1.5 text-xs text-right opacity-60 dark:opacity-100 dark:text-muted-foreground">
                <Link href="/privacy/" className="hover:underline">
                  {t('inlineCta.privacyLink')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
