import styles from '@/styles/Term.module.css';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { IoCloseOutline } from 'react-icons/io5';

export default function Term({ slug, children }) {
  const t = useTranslations('definitions');
  const popupId = useId();

  // if a slug is missing or incorrect, fall back to the original content
  if (!(t.has(slug + '.term') && t.has(slug + '.definition'))) {
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
          <span className={styles.defTitle}>{t(slug + '.term')}</span>
          <button
            type="button"
            aria-label={t('closeAriaLabel')}
            popoverTarget={popupId}
            popoverTargetAction="hide"
            className={styles.defClose}
          >
            <IoCloseOutline className={styles.closeIcon} size={20} />
          </button>
        </span>
        <span className={styles.defBody}>{t(slug + '.definition')}</span>
      </span>
    </>
  );
}
