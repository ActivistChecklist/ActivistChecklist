'use client';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, lazy, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

// Lazy load the ContactForm
const ContactForm = lazy(() => import('@/components/forms/ContactForm'));

export function FeedbackCTA() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const t = useTranslations();

  return (
    <div className="print:hidden mt-8 flex flex-col gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{t('feedbackCta.heading')}</span>{' '}
        {t('feedbackCta.barText')}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:self-auto shrink-0"
        onClick={() => setIsDialogOpen(true)}
      >
        <MessageCircle aria-hidden="true" />
        {t('feedbackCta.buttonText')}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('feedbackCta.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            }
          >
            <ContactForm successMessage={t('feedbackCta.successMessage')} context="feedback_cta" />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}
