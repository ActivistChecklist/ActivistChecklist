import Link from '@/components/Link';
import styles from '@/styles/Term.module.css';
import { ChevronLeft, ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { usePathname } from '@/i18n/navigation';
import { isInternalHref, isSafeHref, parseInlineMarkdown } from '@/lib/inline-markdown';

const samePath = (a, b) => a.replace(/\/+$/, '') === (b || '').replace(/\/+$/, '');

// matches the popup CSS breakpoint: from here up, popups float next to the term, so a
// term link swaps this popup's content instead of stacking a second popup on top of it
const SWAP_QUERY = '(min-width: 640px)';

// external links get an icon so readers can tell they're leaving the site
function TermLink({ href, children }) {
  return (
    <Link href={href} className="link">
      {children}
      {!isInternalHref(href) && <ExternalLink className={styles.sourceIcon} aria-hidden="true" />}
    </Link>
  );
}

// On phones a term link opens that term's sheet on top of this one; inside that second
// sheet, term links are plain text so two terms that link to each other can't nest forever.
// On wider screens onNavigate swaps this popup's content instead.
function renderInlineMarkdown(nodes, nested, onNavigate) {
  return nodes.map((node, i) => {
    if (node.type === 'text') return node.value;
    const children = renderInlineMarkdown(node.children, nested, onNavigate);
    if (node.type === 'strong') return <strong key={i}>{children}</strong>;
    if (node.type === 'em') return <em key={i}>{children}</em>;
    if (node.type === 'term') {
      if (nested) return <Fragment key={i}>{children}</Fragment>;
      return (
        <Term key={i} slug={node.slug} nested onNavigate={onNavigate}>
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

export default function Term({ slug, children, nested = false, onNavigate }) {
  const t = useTranslations();
  const popupId = useId();
  const pathname = usePathname();
  // terms opened from links inside this popup on wider screens; the last one is showing
  const [trail, setTrail] = useState([]);
  const moveFocus = useRef(false);
  const backRef = useRef(null);
  const closeRef = useRef(null);
  const key = 'definitions.' + slug;
  const activeKey = 'definitions.' + (trail.at(-1) ?? slug);

  // the link or back button that was clicked is gone after the swap, so keep focus in the popup
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (backRef.current ?? closeRef.current)?.focus();
  }, [trail]);

  // if a slug is missing or incorrect, fall back to the original content
  if (!(t.has(key + '.term') && t.has(key + '.definition'))) {
    return children;
  }

  const navigate = (target) => {
    moveFocus.current = true;
    setTrail((current) => [...current, target]);
  };
  const goBack = () => {
    moveFocus.current = true;
    setTrail((current) => current.slice(0, -1));
  };
  const handleTermClick = (event) => {
    if (onNavigate && window.matchMedia(SWAP_QUERY).matches) {
      // cancelling the click stops the button from opening its own popup
      event.preventDefault();
      onNavigate(slug);
    } else if (!nested) {
      setTrail([]);
    }
  };
  const previousTitle = trail.length > 0 && t('definitions.' + (trail.at(-2) ?? slug) + '.term');

  // source URLs come from translated message files, so only allow https or site-relative links
  const url =
    t.has(activeKey + '.url') && t.has(activeKey + '.source') ? t(activeKey + '.url') : '';
  // skip a link to the page the reader is already on
  const onThatPage = isInternalHref(url) && samePath(url.split('#')[0], pathname);
  const sourceUrl = isSafeHref(url) && !onThatPage ? url : null;

  return (
    <>
      <button
        type="button"
        popoverTarget={popupId}
        popoverTargetAction="toggle"
        onClick={handleTermClick}
        className={styles.term}
      >
        {children}
        <FaQuestionCircle size={14} className={styles.termIcon} />
      </button>

      <span popover="auto" id={popupId} data-pagefind-ignore="all" className={styles.def}>
        {previousTitle && (
          <button
            ref={backRef}
            type="button"
            onClick={goBack}
            aria-label={t('definitions.backAriaLabel', { term: previousTitle })}
            className={styles.defBack}
          >
            <ChevronLeft className={styles.backIcon} aria-hidden="true" />
            {previousTitle}
          </button>
        )}
        <span className={styles.defHead}>
          <span className={styles.defTitle}>{t(activeKey + '.term')}</span>
          <button
            ref={closeRef}
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
          {renderInlineMarkdown(
            parseInlineMarkdown(t.raw(activeKey + '.definition')),
            nested,
            nested ? undefined : navigate,
          )}
          {sourceUrl && (
            <span className={styles.defSource}>
              {t.rich('definitions.learnMore', {
                source: t(activeKey + '.source'),
                link: (chunks) => <TermLink href={sourceUrl}>{chunks}</TermLink>,
              })}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
