'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useNewsletterSubscribe } from '@/components/NewsletterSubscribe';

/**
 * Inline newsletter CTA rendered between sections of a guide or page.
 * Auto-inserted by the page route (see lib/inline-cta-split.js) or placed
 * manually in MDX via <InlineCta />.
 *
 * Visual intent: Substack-style aside — dark surface in light mode so it
 * reads as a distinct break from surrounding checklist cards, primary-tinted
 * surface in dark mode. Compact (not banner-tall).
 */
export default function InlineCta() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(true);
  const { status, error, subscribe } = useNewsletterSubscribe();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await subscribe(email);
    if (success) {
      setEmail('');
      setShowForm(false);
    }
  };

  return (
    <aside
      data-inline-cta
      className="not-prose my-8 rounded-lg bg-foreground text-background dark:bg-primary/15 dark:text-foreground px-5 py-5 sm:px-6 sm:py-5 print:hidden"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex-1 min-w-0">
          <p className="font-heading text-lg font-semibold leading-tight mb-1">
            {t('inlineCta.heading')}
          </p>
          <p className="text-sm leading-snug opacity-90 dark:opacity-100 dark:text-muted-foreground">
            {t('inlineCta.description')}
          </p>
        </div>

        <div className="sm:max-w-xs sm:w-full sm:shrink-0">
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
            <form onSubmit={handleSubmit} className="flex gap-2">
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
          )}
        </div>
      </div>
    </aside>
  );
}
