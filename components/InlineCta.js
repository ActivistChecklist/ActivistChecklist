'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useNewsletterSubscribe } from '@/components/NewsletterSubscribe';
import { useAnalytics } from '@/hooks/use-analytics';
import {
  markNewsletterPromptDone,
  markNewsletterPromptSeen,
  readPromptState,
  shouldShowInlineCta,
} from '@/lib/newsletter-prompt';

// Grid placement for the form, and for the success message that replaces it.
// Narrow: on its own row under the title. @2xl: middle column of a single row.
const FORM_SLOT =
  'col-span-2 row-start-2 max-w-md @2xl:col-span-1 @2xl:col-start-2 @2xl:row-start-1 @2xl:w-72 @2xl:max-w-none';

/**
 * Inline newsletter CTA rendered between sections of a guide or page.
 * Auto-inserted by the page route (see lib/inline-cta-split.js) or placed
 * manually in MDX via <InlineCta />.
 *
 * Visual intent: low key. One line of text and a form, so it reads as
 * available rather than pushed. The dark surface (primary tint in dark mode,
 * where a black box would vanish) keeps it from passing for body text or for
 * the outlined feedback box at the end of a guide. The button stays neutral
 * (hover only dims it) and turns primary while the field or button has focus.
 *
 * Layout follows the box's own width through a container query, not the
 * viewport, because the guide sidebar changes how wide the column is. Below
 * @2xl the dismiss button sits beside the title and the form drops to its own
 * row; from @2xl up all three share one row.
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
      className="@container not-prose my-8 rounded-lg bg-foreground text-background dark:bg-primary/15 dark:text-foreground print:hidden"
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-3 px-4 py-3.5 @2xl:grid-cols-[1fr_auto_auto] @2xl:items-center @2xl:px-5 @2xl:py-3">
        <p className="min-w-0 font-heading text-base font-medium leading-snug text-balance">
          {t('inlineCta.title')}
        </p>

        {showForm ? (
          <form
            method="post"
            onSubmit={handleSubmit}
            className={`group/sub flex gap-2 ${FORM_SLOT}`}
          >
            <Input
              type="email"
              name="email"
              aria-label={t('inlineCta.emailAriaLabel')}
              placeholder={t('newsletter.placeholders.emailShort')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === 'loading'}
              className="h-10 min-w-0 flex-1 border-transparent text-foreground focus-visible:ring-offset-foreground @2xl:h-9 dark:border-input dark:focus-visible:ring-offset-background"
            />
            <Button
              type="submit"
              size="sm"
              disabled={status === 'loading'}
              className="h-10 shrink-0 bg-background text-foreground hover:bg-background/90 group-focus-within/sub:bg-primary group-focus-within/sub:text-primary-foreground group-focus-within/sub:hover:bg-primary @2xl:h-9 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('inlineCta.buttonText')
              )}
            </Button>
          </form>
        ) : (
          status === 'success' && (
            // Wrapped so the alert is a first child and skips its stacking margin.
            <div className={FORM_SLOT}>
              <Alert variant="success" className="text-sm newsletter-alert">
                {t('newsletter.successShort')}
              </Alert>
            </div>
          )
        )}

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('inlineCta.dismissLabel')}
          title={t('inlineCta.dismissLabel')}
          className="col-start-2 row-start-1 -mr-1.5 -mt-1 rounded-md p-1.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring @2xl:col-start-3 @2xl:mt-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        {status === 'error' && (
          <div className="col-span-full">
            <Alert variant="error" className="text-sm newsletter-alert">
              {error}
            </Alert>
          </div>
        )}
      </div>
    </aside>
  );
}
