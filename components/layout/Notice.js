'use client';

import { IoWarning, IoInformationCircle, IoClose } from 'react-icons/io5';
import styles from '@/styles/PageNotices.module.css';

const ICONS = {
  warning: IoWarning,
  info: IoInformationCircle,
};

/**
 * Notice — presentational building block for page-level notices.
 *
 * Stateless by design: persistence (cookies, localStorage, session-only) is the
 * caller's responsibility because different notices have different lifetimes.
 *
 * @param {'warning'|'info'} type
 * @param {string|ReactNode} message
 * @param {() => void} [onDismiss] When provided, renders an accessible dismiss button.
 * @param {string} [dismissLabel] aria-label for the dismiss button (required when onDismiss is set).
 */
export default function Notice({ type = 'warning', message, onDismiss, dismissLabel }) {
  const Icon = ICONS[type] ?? ICONS.warning;
  return (
    <div className={`${styles.notice} ${styles[type]}`}>
      <div className={styles.iconCol}>
        <Icon className={styles.icon} aria-hidden />
      </div>
      <div className={styles.textCol}>{message}</div>
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <IoClose aria-hidden />
        </button>
      )}
    </div>
  );
}
