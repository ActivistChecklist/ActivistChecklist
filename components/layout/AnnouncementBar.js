'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Bell } from 'lucide-react';
import { IoMegaphone } from 'react-icons/io5';
import Link from '@/components/Link';
import { useAnnouncement } from '@/contexts/AnnouncementContext';

const colorSchemes = {
  primary: {
    background: 'bg-primary',
    text: 'text-primary-foreground',
    button: {
      background: 'bg-primary-foreground',
      text: 'text-primary',
    },
    buttonOutline:
      'border border-primary-foreground/80 bg-transparent text-primary-foreground hover:bg-primary-foreground/15',
  },
};

const ICON_MAP = {
  bell: Bell,
  megaphone: IoMegaphone,
  none: null,
};

const STORAGE_PREFIX = 'announcement_dismissed_';

let hasAnimatedIn = false;

const AnnouncementBar = () => {
  const announcement = useAnnouncement();
  const [shouldShow, setShouldShow] = useState(false);
  const innerRef = useRef(null);
  const [height, setHeight] = useState(0);
  const skipTransition = useRef(false);

  useEffect(() => {
    if (!announcement) return;

    if (announcement.disableAfterDate) {
      const cutoff = new Date(announcement.disableAfterDate + 'T23:59:59');
      if (!isNaN(cutoff) && new Date() > cutoff) return;
    }

    const isDismissed = localStorage.getItem(STORAGE_PREFIX + announcement.dismissKey);
    if (isDismissed) return;

    if (innerRef.current) {
      setHeight(innerRef.current.scrollHeight);
    }

    if (hasAnimatedIn) {
      skipTransition.current = true;
      setShouldShow(true);
      return;
    }

    hasAnimatedIn = true;
    let raf;
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        setShouldShow(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [announcement]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [announcement]);

  const handleDismiss = () => {
    if (!announcement) return;
    setShouldShow(false);
    localStorage.setItem(STORAGE_PREFIX + announcement.dismissKey, 'true');
  };

  if (!announcement) return null;

  const Icon = ICON_MAP[announcement.icon] ?? IoMegaphone;
  const allowDismiss = announcement.allowDismiss ?? true;
  const theme = colorSchemes[announcement.colorScheme] ?? colorSchemes.primary;
  const btnBase =
    'inline-flex items-center px-3 py-1 rounded-md text-sm font-medium transition-colors';
  const btnClass = `${btnBase} ${theme.button.background} ${theme.button.text} hover:opacity-90`;
  const secondaryBtnClass = `${btnBase} ${theme.buttonOutline ?? 'border border-primary-foreground/80 bg-transparent text-primary-foreground hover:bg-primary-foreground/15'}`;
  const hasSecondary =
    announcement.secondaryButtonText && announcement.secondaryButtonUrl;

  const useTransition = !(shouldShow && skipTransition.current);

  return (
    <div
      className="not-annotatable"
      style={{
        maxHeight: shouldShow ? `${height}px` : '0px',
        opacity: shouldShow ? 1 : 0,
        overflow: 'hidden',
        transition: useTransition
          ? 'max-height 300ms ease-out, opacity 200ms ease-out'
          : 'none',
      }}
    >
      <div ref={innerRef} className={`${theme.background} ${theme.text}`}>
        <div className="max-w-5xl mx-auto px-4 py-2">
          {/* Mobile layout: stacked */}
          <div className="md:hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium flex items-center gap-2 flex-1">
                {Icon && <Icon size={18} className="shrink-0" />}
                <span>
                  {announcement.title && (
                    <span className="font-bold mr-1">{announcement.title}:</span>
                  )}
                  {announcement.message}
                </span>
              </div>
              {allowDismiss && (
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:opacity-80 transition-opacity ml-2 shrink-0"
                  aria-label="Close announcement"
                  type="button"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {announcement.buttonText && announcement.buttonUrl && (
              <div className="flex flex-wrap justify-center gap-2">
                <Link href={announcement.buttonUrl} className={btnClass}>
                  {announcement.buttonText}
                </Link>
                {hasSecondary && (
                  <Link
                    href={announcement.secondaryButtonUrl}
                    className={secondaryBtnClass}
                  >
                    {announcement.secondaryButtonText}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Desktop layout: inline */}
          <div className="hidden md:flex items-center justify-between">
            <div className="text-sm font-medium text-center flex-1 flex items-center justify-center gap-3">
              {Icon && <Icon size={18} className="shrink-0" />}
              <span>
                {announcement.title && (
                  <span className="font-bold mr-1">{announcement.title}</span>
                )}
                {announcement.message}
              </span>
              {announcement.buttonText && announcement.buttonUrl && (
                <>
                  <Link href={announcement.buttonUrl} className={btnClass}>
                    {announcement.buttonText}
                  </Link>
                  {hasSecondary && (
                    <Link
                      href={announcement.secondaryButtonUrl}
                      className={secondaryBtnClass}
                    >
                      {announcement.secondaryButtonText}
                    </Link>
                  )}
                </>
              )}
            </div>
            {allowDismiss && (
              <button
                onClick={handleDismiss}
                className="p-1 hover:opacity-80 transition-opacity ml-2"
                aria-label="Close announcement"
                type="button"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementBar;
