import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Browser chrome around each tool illustration on /tools/.
 *
 * Everything inside is a hand-built recreation of the tool's interface, not a
 * captured screenshot. That keeps the text crisp at any width, lets the
 * illustrations follow the site's light/dark theme, and means nobody has to
 * re-shoot four screenshots every time one of the tools ships a change. The
 * trade-off is that these drift from the real products, so treat them as
 * marketing illustrations and re-check them when a tool's UI changes.
 *
 * They are decorative: the frame carries a translated `label` as its accessible
 * name, and everything inside is hidden from assistive tech (`aria-hidden` under
 * `role="img"`) and from the Pagefind index. Product colors inside the frame are
 * deliberately hard-coded rather than drawn from our semantic tokens, because
 * they belong to the tool being depicted, not to this site's theme.
 */
export default function BrowserFrame({ label, url, children, className, bodyClassName }) {
  return (
    <div
      role="img"
      aria-label={label}
      data-pagefind-ignore
      className={cn(
        'overflow-hidden rounded-xl border border-[#dcdce3] bg-[#f1f1f4] shadow-lg',
        'dark:border-[#33333c] dark:bg-[#212128]',
        className
      )}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-1.5 border-b border-[#dcdce3] px-3 py-2 dark:border-[#33333c]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e9a0a0]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e3c887]" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#a2cfa2]" />
          <span className="ml-2 flex min-w-0 items-center gap-1.5 rounded-md border border-[#e2e2e8] bg-white px-2.5 py-1 text-[11px] leading-none text-[#5c5c66] dark:border-[#3a3a44] dark:bg-[#17171c] dark:text-[#9a9aa6]">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{url}</span>
          </span>
        </div>
        <div className={cn('overflow-hidden', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
