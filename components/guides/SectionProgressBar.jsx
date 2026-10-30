import { cn } from '@/lib/utils';

/**
 * Thin, purely visual progress bar for a guide section. Callers supply the
 * readable "X of Y complete" text themselves, so this stays aria-hidden.
 */
export default function SectionProgressBar({ progress, className }) {
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <span aria-hidden className={cn('block h-1 overflow-hidden rounded-full bg-muted', className)}>
      <span
        className={cn(
          'block h-full rounded-[inherit] transition-[width,background-color] duration-500 ease-out',
          progress.complete ? 'bg-success' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
