'use client';
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, lazy, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

// Lazy load the ContactForm
const ContactForm = lazy(() => import('@/components/forms/ContactForm'));

export function FeedbackCTA() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const t = useTranslations();

  return (
    <div className="print:hidden mt-8 px-8 py-12 bg-neutral-900 text-neutral-50 rounded-xl">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <h3 className="text-2xl font-bold">{t('feedbackCta.heading')}</h3>
        <p className="text-neutral-300 max-w-md mx-auto">
          {t('feedbackCta.description')}
        </p>
        <div className="flex gap-2 max-w-md mx-auto">
          <Input
            type="text"
            placeholder={t('feedbackCta.inputPlaceholder')}
            className="flex-1 bg-neutral-800 border-neutral-700 text-neutral-100 placeholder:text-neutral-400 ring-offset-neutral-900 focus-visible:ring-white"
            onClick={() => setIsDialogOpen(true)}
            readOnly
          />
          <Button
            variant="default"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setIsDialogOpen(true)}
          >
            <Send className="w-4 h-4" />
            <span>{t('feedbackCta.sendButton')}</span>
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('feedbackCta.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }>
            <ContactForm
              successMessage={t('feedbackCta.successMessage')}
              context="feedback_cta"
            />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}
