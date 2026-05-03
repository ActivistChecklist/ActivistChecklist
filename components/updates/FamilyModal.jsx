'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Modal that explains how to find a device model or OS version on the selected platform.
 * Content is sourced from `messages/en.json → updates.family.<group>.modalSteps[]`.
 */
export default function FamilyModal({ group, open, onOpenChange }) {
  const t = useTranslations();

  if (!group) return null;

  // Numbered steps for apple/android/windows; "other" uses a single body paragraph.
  const isOther = group === 'other';
  const steps = isOther
    ? null
    : t.raw(`updates.family.${group}.modalSteps`);
  const note = isOther ? null : t(`updates.family.${group}.modalNote`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`updates.family.${group}.modalTitle`)}</DialogTitle>
        </DialogHeader>

        {isOther ? (
          <DialogDescription className="text-sm leading-relaxed text-foreground">
            {t.rich('updates.family.other.modalBody', {
              link: (chunks) => (
                <a
                  href="https://endoflife.date"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </DialogDescription>
        ) : (
          <div className="space-y-3 text-sm text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              {Array.isArray(steps) &&
                steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">{step}</li>
                ))}
            </ol>
            {note ? (
              <p className="pt-2 text-xs text-muted-foreground">{note}</p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
