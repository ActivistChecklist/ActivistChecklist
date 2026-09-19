'use client';

import { useState, useRef, useEffect } from 'react';
import { IoCopyOutline, IoCheckmarkSharp } from 'react-icons/io5';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import styles from './CopyButton.module.css';

/**
 * Copy-the-blockquote-text button used inside `<blockquote>` elements in MDX.
 *
 * Two visual modes, switched purely via CSS in CopyButton.module.css (no JS
 * detection, no runtime flash):
 *
 *   - Default: an inline muted pill with icon + "Copy" label. Looks like a
 *     normal small action button.
 *   - Inside a blockquote: floats to the top-right corner as an icon-only
 *     button; the label hides (kept in the DOM as sr-only), and a "Copy text"
 *     tooltip appears on hover. The blockquote itself is bumped to
 *     position: relative via blockquote:has(.button).
 *
 * The keep-it-as-one-JSX-tree approach (with CSS handling layout differences)
 * avoids the hydration flash a useEffect-based detection would cause.
 */
export default function CopyButton({ className = '' }) {
  const [copied, setCopied] = useState(false);
  const buttonRef = useRef(null);
  const timeoutRef = useRef(null);
  const t = useTranslations();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const formatTextContent = (element) => {
    let text = '';
    const childNodes = element.childNodes;

    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const trimmedText = node.textContent.trim();
        if (trimmedText) {
          text += trimmedText + '\n\n';
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'UL') {
          const items = node.querySelectorAll('li');
          items.forEach((item) => {
            text += '• ' + item.textContent.trim() + '\n';
          });
          text += '\n';
        } else if (node.tagName === 'P') {
          text += node.textContent.trim() + '\n\n';
        } else if (node.tagName !== 'BUTTON') {
          // Skip the copy button itself
          text += formatTextContent(node);
        }
      }
    }
    return text;
  };

  const copyToClipboard = async () => {
    try {
      // Find the nearest blockquote ancestor; fall back to parent element
      const targetElement =
        buttonRef.current.closest('blockquote') || buttonRef.current.parentElement;
      const formattedText = formatTextContent(targetElement)
        .replace(/Copy|Copied/g, '') // Remove "Copy" and "Copied" text
        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
        .trim();

      await navigator.clipboard.writeText(formattedText);

      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const Icon = copied ? IoCheckmarkSharp : IoCopyOutline;
  const label = copied ? t('copyButton.copied') : t('copyButton.copy');
  const tooltipText = copied ? t('copyButton.copied') : t('copyButton.copyText');

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            onClick={copyToClipboard}
            aria-label={t('copyButton.ariaLabel')}
            className={cn(styles.button, className)}
          >
            <Icon className={styles.icon} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
