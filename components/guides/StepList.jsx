import styles from '@/styles/StepList.module.css';

/**
 * StepList: shows the ordered list inside it as numbered steps joined by a line.
 *
 * Usage in MDX:
 *   <StepList>
 *     1. First step
 *     2. Second step
 *   </StepList>
 */
export default function StepList({ children }) {
  return <div className={styles.stepList}>{children}</div>;
}
