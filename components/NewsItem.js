'use client';
import React from 'react';
import Markdown from '@/components/Markdown';
import Link from '@/components/Link';
import { cn, formatRelativeDate } from '@/lib/utils';
import Image from 'next/image';
import { IoNewspaperOutline } from 'react-icons/io5';
import { useIsMobile } from '@/hooks/use-mobile';
import { isPaywallBypassActiveForUrl } from '@/lib/paywall-bypass-url';
import { useLocale, useTranslations } from 'next-intl';
import { getIntlLocale } from '@/lib/i18n-config';

function PaywallBypassNotice({ originalUrl }) {
  const t = useTranslations();
  return (
    <div className="text-xs text-muted-foreground italic">
      {t('news.paywallBypassNotice')}{' '}
      <a
        href={originalUrl}
        className="underline hover:no-underline hover:text-primary transition-colors duration-200"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {t('news.seeOriginal')}
      </a>
      .
    </div>
  );
}

const NewsItem = ({ entry }) => {
  const isMobile = useIsMobile();
  const locale = useLocale();
  const dateLocale = getIntlLocale(locale);

  if (!entry) {
    return null;
  }

  const { date, source, url: originalUrl, title, imagePath, tags, commentText } = entry;
  const displaySource = source?.name || source || null;

  const imageInfo = imagePath
    ? { exists: true, src: imagePath }
    : { exists: false, src: null };

  const dateString = date || new Date().toISOString();
  const hasUrl = !!originalUrl;
  const showBypassNotice = hasUrl && isPaywallBypassActiveForUrl(originalUrl);

  // Meta row component
  const MetaRow = () => (
    <div className="text-sm text-muted-foreground mb-2">
      <div className="flex flex-wrap items-center gap-1">
        <span>{formatRelativeDate(dateString, dateLocale)}</span>
        {tags && tags.length > 0 && (
          <>
            <span>•</span>
            {tags.map((tag, index) => (
              <span key={index} className="bg-muted text-muted-foreground px-2 py-1 rounded text-xs whitespace-nowrap">
                {tag}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );

  const NewsItemContent = () => (
    <>
      {isMobile ? (
        // Mobile layout: stacked vertically
        <div className="space-y-3">
          {/* Title and Image in a row */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold mb-2 line-clamp-3 transition-all duration-100 text-foreground">
                {hasUrl ? (
                  <Link
                    href={originalUrl}
                    className="hover:underline hover:decoration-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {title || 'News Item'}
                  </Link>
                ) : (
                  <span>{title || 'News Item'}</span>
                )}
                {displaySource && (
                  <span className="text-lg font-normal text-muted-foreground group-hover:text-foreground/70 ms-1">
                    • {displaySource}
                  </span>
                )}
              </h3>
            </div>

            {/* Image */}
            <div className="shrink-0">
              {hasUrl ? (
                <Link
                  href={originalUrl}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-32 h-20 bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
                    {imageInfo.exists ? (
                      <Image
                        src={imageInfo.src}
                        alt={title || 'News item'}
                        width={128}
                        height={80}
                        className="w-full h-full object-cover group-hover:scale-110 transition-all duration-200"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <IoNewspaperOutline className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="w-32 h-20 bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
                  {imageInfo.exists ? (
                    <Image
                      src={imageInfo.src}
                      alt={title || 'News item'}
                      width={128}
                      height={80}
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-200"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <IoNewspaperOutline className="w-8 h-8" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Meta row below title and image */}
          <MetaRow />

          {/* Comment */}
          {commentText && (
            <div className="prose prose-slate max-w-none text-sm">
              <Markdown content={commentText} isProse={false} />
            </div>
          )}

          {showBypassNotice && <PaywallBypassNotice originalUrl={originalUrl} />}
        </div>
      ) : (
        // Desktop layout: side by side
        <div className="flex gap-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="text-lg font-semibold mb-2 line-clamp-3 transition-all duration-100 text-foreground">
              {hasUrl ? (
                <Link
                  href={originalUrl}
                  className="hover:underline hover:decoration-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  {title || 'News Item'}
                </Link>
              ) : (
                <span>{title || 'News Item'}</span>
              )}
              {displaySource && (
                <span className="text-lg font-normal text-muted-foreground group-hover:text-foreground/70 ms-1">
                  • {displaySource}
                </span>
              )}
            </h3>

            {/* Comment */}
            {commentText && (
              <div className="prose prose-slate max-w-none text-sm mb-2">
                <Markdown content={commentText} isProse={false} />
              </div>
            )}

            {/* Meta row: Date • Source • Tags */}
            <MetaRow />

            {showBypassNotice && <PaywallBypassNotice originalUrl={originalUrl} />}
          </div>

          {/* Image */}
          <div className="shrink-0">
            {hasUrl ? (
              <Link
                href={originalUrl}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-48 h-28 bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
                  {imageInfo.exists ? (
                    <Image
                      src={imageInfo.src}
                      alt={title || 'News item'}
                      width={192}
                      height={112}
                      className="w-full h-full object-cover group-hover:scale-110 transition-all duration-200"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <IoNewspaperOutline className="w-10 h-10" />
                    </div>
                  )}
                </div>
              </Link>
            ) : (
              <div className="w-48 h-28 bg-muted rounded-lg overflow-hidden flex items-center justify-center relative">
                {imageInfo.exists ? (
                  <Image
                    src={imageInfo.src}
                    alt={title || 'News item'}
                    width={192}
                    height={112}
                    className="w-full h-full object-cover group-hover:scale-110 transition-all duration-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <IoNewspaperOutline className="w-10 h-10" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  // Return the content in a div container
  return (
    <div className="news-item mb-4 bg-card border border-border rounded-lg p-4 hover:shadow-xs hover:bg-accent/20 transition-all duration-200 group">
      <NewsItemContent />
    </div>
  );
};

export default NewsItem;
