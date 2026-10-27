import Link from '@/components/Link';
import styles from '@/styles/Term.module.css';
import { ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useId } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { usePathname } from '@/i18n/navigation';
import { isInternalHref, isSafeHref, parseInlineMarkdown } from '@/lib/inline-markdown';

const samePath = (a, b) => a.replace(/\/+$/, '') === (b || '').replace(/\/+$/, '');

// external links get an icon so readers can tell they're leaving the site
function TermLink({ href, children }) {
  return (
    <Link href={href} className="link">
      {children}
      {!isInternalHref(href) && <ExternalLink className={styles.sourceIcon} aria-hidden="true" />}
    </Link>
  );
}

// a term link opens that term's popup on top of this one; inside that second popup,
// term links are plain text so two terms that link to each other can't nest forever
function renderInlineMarkdown(nodes, nested) {
  return nodes.map((node, i) => {
    if (node.type === 'text') return node.value;
    const children = renderInlineMarkdown(node.children, nested);
    if (node.type === 'strong') return <strong key={i}>{children}</strong>;
    if (node.type === 'em') return <em key={i}>{children}</em>;
    if (node.type === 'term') {
      if (nested) return <Fragment key={i}>{children}</Fragment>;
      return (
        <Term key={i} slug={node.slug} nested>
          {children}
        </Term>
      );
    }
    return (
      <TermLink key={i} href={node.href}>
        {children}
      </TermLink>
    );
  });
}

export default function Term({ slug, children, nested = false }) {
  const t = useTranslations();
  const popupId = useId();
  const pathname = usePathname();
  const key = 'definitions.' + slug;

  // if a slug is missing or incorrect, fall back to the original content
  if (!(t.has(key + '.term') && t.has(key + '.definition'))) {
    return children;
  }

  // source URLs come from translated message files, so only allow https or site-relative links
  const url = t.has(key + '.url') && t.has(key + '.source') ? t(key + '.url') : '';
  // skip a link to the page the reader is already on
  const onThatPage = isInternalHref(url) && samePath(url.split('#')[0], pathname);
  const sourceUrl = isSafeHref(url) && !onThatPage ? url : null;

  return (
    <>
      <button
        type="button"
        popoverTarget={popupId}
        popoverTargetAction="toggle"
        className={styles.term}
      >
        {children}
        <FaQuestionCircle size={14} className={styles.termIcon} />
      </button>

      <span popover="auto" id={popupId} data-pagefind-ignore="all" className={styles.def}>
        <span className={styles.defHead}>
          <span className={styles.defTitle}>{t(key + '.term')}</span>
          <button
            type="button"
            aria-label={t('definitions.closeAriaLabel')}
            popoverTarget={popupId}
            popoverTargetAction="hide"
            className={styles.defClose}
          >
            <X className={styles.closeIcon} size={20} />
          </button>
        </span>
        <span className={styles.defBody}>
          {/* raw, not t(): definitions are inline Markdown with no ICU arguments */}
          {renderInlineMarkdown(parseInlineMarkdown(t.raw(key + '.definition')), nested)}
          {sourceUrl && (
            <span className={styles.defSource}>
              {t.rich('definitions.learnMore', {
                source: t(key + '.source'),
                link: (chunks) => <TermLink href={sourceUrl}>{chunks}</TermLink>,
              })}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
