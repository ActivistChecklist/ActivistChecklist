'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { useTranslations } from 'next-intl';
import { useAnalytics } from '@/hooks/use-analytics';

/**
 * @param {string} context - where the subscribe form is rendered (e.g. 'footer',
 *   'inline'). Sent to Umami as event data so we can tell which placements
 *   convert. NEVER pass the email address — analytics stays anonymous.
 */
export function useNewsletterSubscribe(context = 'unknown') {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const { trackEvent } = useAnalytics();

  const subscribe = async (email) => {
    setStatus('loading');
    setError('');

    try {
      const response = await fetch('/api-server/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus('success');
        trackEvent({
          name: 'newsletter_subscribed',
          data: { context },
        });
        return true;
      } else {
        setStatus('error');
        setError(result.error || 'Failed to subscribe. Please try again.');
        return false;
      }
    } catch (err) {
      setStatus('error');
      setError('Network error. Please try again.');
      return false;
    }
  };

  return {
    status,
    error,
    subscribe,
  };
}

export function NewsletterSubscribeForm({ onSuccess, context = 'form' }) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(true);
  const { status, error, subscribe } = useNewsletterSubscribe(context);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await subscribe(email);
    if (success) {
      setEmail('');
      onSuccess?.();
      setShowForm(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {status === 'error' && (
        <Alert 
          variant="error" 
          className="mb-4 newsletter-alert"
        >
          {error}
        </Alert>
      )}

      {status === 'success' && !showForm && (
        <Alert 
          variant="success" 
          className="mb-4 newsletter-alert"
        >
          {t('newsletter.successLong')}
        </Alert>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              name="email"
              placeholder={t('newsletter.placeholders.emailLong')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === 'loading'}
              className="flex-1"
            />
            <Button 
              type="submit"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('newsletter.subscribe')
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function CompactNewsletterSubscribe({ context = 'footer' } = {}) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [showForm, setShowForm] = useState(true);
  const { status, error, subscribe } = useNewsletterSubscribe(context);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await subscribe(email);
    if (success) {
      setEmail('');
      setShowForm(false);
    }
  };

  return (
    <div className="space-y-2">
      {status === 'error' && (
        <Alert 
          variant="error" 
          className="text-sm newsletter-alert"
        >
          {error}
        </Alert>
      )}

      {status === 'success' && !showForm && (
        <Alert 
          variant="success" 
          className="text-sm newsletter-alert"
        >
          {t('newsletter.successShort')}
        </Alert>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            name="email"
            placeholder={t('newsletter.placeholders.emailShort')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={status === 'loading'}
            className="max-w-xs"
          />
          <Button 
            type="submit"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              '→'
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

export default NewsletterSubscribeForm;
