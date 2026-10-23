import styles from '@/styles/Term.module.css';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { IoCloseOutline } from 'react-icons/io5';

export default function Term({ slug, children }) {
  const t = useTranslations();
  const popupId = useId();

  return (
    <>
      <button
        popoverTarget={popupId}
        popoverTargetAction="toggle"
        aria-labelledby={'term-' + popupId}
        aria-describedby={'def-' + popupId}
        className={styles.term}
      >
        {children}
        <FaQuestionCircle size={14} className={styles.termIcon} />
      </button>

      <span popover="auto" id={popupId} data-pagefind-ignore="all" className={styles.def}>
        <span className={styles.defHead}>
          <span id={'term-' + popupId} className={styles.defTitle}>
            {t('definitions.' + slug + '.term')}
          </span>
          <button
            aria-label="Close"
            popoverTarget={popupId}
            popoverTargetAction="hide"
            className={styles.defClose}
          >
            <IoCloseOutline className={styles.closeIcon} size={20} />
          </button>
        </span>
        <span id={'def-' + popupId} className={styles.defBody}>
          {t('definitions.' + slug + '.definition')}
        </span>
      </span>
    </>
  );
}
