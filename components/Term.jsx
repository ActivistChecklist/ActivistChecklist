import Link from '@/components/Link';
import styles from '@/styles/Term.module.css';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { usePathname } from '@/i18n/navigation';

const samePath = (a, b) => a.replace(/\/+$/, '') === (b || '').replace(/\/+$/, '');

export default function Term({ slug, children }) {
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
  const isInternal = url.startsWith('/') && !url.startsWith('//');
  // skip a link to the page the reader is already on
  const onThatPage = isInternal && samePath(url.split('#')[0], pathname);
  const sourceUrl = (url.startsWith('https://') || isInternal) && !onThatPage ? url : null;

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
          {t(key + '.definition')}
          {sourceUrl && (
            <span className={styles.defSource}>
              {t.rich('definitions.learnMore', {
                source: t(key + '.source'),
                link: (chunks) => (
                  <Link href={sourceUrl} className="link">
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
