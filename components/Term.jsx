import styles from '@/styles/Term.module.css';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';

export default function Term({ slug, children }) {
  const t = useTranslations();
  const popupId = useId();
  const key = 'definitions.' + slug;

  // if a slug is missing or incorrect, fall back to the original content
  if (!(t.has(key + '.term') && t.has(key + '.definition'))) {
    return children;
  }

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
        <span className={styles.defBody}>{t(key + '.definition')}</span>
      </span>
    </>
  );
}
