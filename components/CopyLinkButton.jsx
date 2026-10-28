'use client';
import React, { useState, useEffect } from 'react';
import { Check, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Link icon that copies the page URL with `#slug` to the clipboard and puts the
 * hash in the address bar. `label` is the tooltip and aria-label (defaults to
 * the checklist item wording).
 */
const CopyLinkButton = ({ slug, onCopy, label }) => {
  const t = useTranslations();
  const copyLabel = label ?? t('checklistItem.copyLink');
  const [linkCopied, setLinkCopied] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [linkHref, setLinkHref] = useState(() => `#${slug}`);

  useEffect(() => {
    const pathWithSearch = `${window.location.pathname}${window.location.search}`;
    setLinkHref(`${window.location.origin}${pathWithSearch}#${slug}`);
  }, [slug]);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pathWithSearch = `${window.location.pathname}${window.location.search}`;
    const url = `${window.location.origin}${pathWithSearch}#${slug}`;
    window.history.replaceState(null, '', `${pathWithSearch}#${slug}`);

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTooltipOpen(true);

      // Call the parent's copy handler if provided
      if (onCopy) {
        onCopy(url);
      }

      // Reset after 2 seconds
      setTimeout(() => {
        setLinkCopied(false);
        setTooltipOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0} open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <a
            href={linkHref}
            onClick={handleCopy}
            className={cn(
              'relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md align-middle transition-colors duration-200',
              'hover:bg-foreground/10',
              'text-muted-foreground hover:text-foreground',
              'no-underline',
              'print:hidden',
              linkCopied && 'text-success',
            )}
            aria-label={copyLabel}
          >
            <Link2
              aria-hidden
              className={cn(
                'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200',
                linkCopied && 'opacity-0',
              )}
            />
            <Check
              aria-hidden
              className={cn(
                'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-success transition-opacity duration-200',
                linkCopied ? 'opacity-100' : 'opacity-0',
              )}
            />
          </a>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          {linkCopied ? t('checklistItem.linkCopied') : copyLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default CopyLinkButton;
