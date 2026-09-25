import { Check, Trash2 } from 'lucide-react';

/**
 * Illustration of the AI chat auto-delete extension: the bar it puts on
 * claude.ai when deletions are waiting, above its settings. See BrowserFrame for
 * why these are hand-built rather than screenshots. The slate palette and teal
 * accent are the extension's own (src/options/options.html), so they are
 * hard-coded here rather than drawn from our tokens, but they keep the
 * extension's real light and dark variants.
 */

const CARD =
  'rounded-xl border border-[#E2E8F0] bg-white dark:border-[#334155] dark:bg-[#1E293B]';
const LABEL = 'text-[11px] font-semibold text-[#334155] dark:text-[#CBD5E1] sm:text-xs';
const PILL_OFF =
  'rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-2.5 py-1.5 text-[11px] font-semibold text-[#475569] dark:border-[#334155] dark:bg-[#0F172A] dark:text-[#94A3B8]';
const PILL_ON =
  'rounded-md bg-[#0D9488] px-2.5 py-1.5 text-[11px] font-bold text-white';

function CheckedBox() {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#0D9488] text-white">
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
  );
}

function Bar({ label, width, count, muted }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-[#0F172A] dark:text-[#E2E8F0] sm:text-xs">
      <span className="w-11 shrink-0 text-[#64748B] dark:text-[#94A3B8]">{label}</span>
      <span className={`h-2 rounded-full ${muted} ${width}`} />
      <span className="font-bold">{count}</span>
    </div>
  );
}

export default function AutoDeleteShot() {
  return (
    <div className="bg-[#F8FAFC] p-3 dark:bg-[#0F172A] sm:p-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#0D9488] px-3 py-2.5">
        <Trash2 className="h-4 w-4 shrink-0 text-white" />
        <span className="grow text-[11px] font-semibold text-white sm:text-xs">
          <strong>14 chats</strong> are older than 30 days.
        </span>
        <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-[#0F766E]">
          Review &amp; delete
        </span>
        <span className="hidden rounded-md border border-white/40 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white sm:inline">
          Snooze a day
        </span>
      </div>

      <div className={`mt-3 overflow-hidden ${CARD}`}>
        <div className="border-b border-[#F1F5F9] px-3 py-2.5 dark:border-[#334155] sm:px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F172A] dark:text-[#F1F5F9]">
            Schedule
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#94A3B8] sm:text-xs">
            When and how often to check for old chats
          </p>
        </div>

        <div className="flex flex-col gap-3 px-3 py-3 dark:border-[#334155] sm:gap-3.5 sm:px-4">
          <div>
            <span className={`mb-1.5 block ${LABEL}`}>Delete chats older than (days)</span>
            <div className="flex items-center gap-2.5">
              <span className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1.5 font-heading text-base font-bold text-[#0F172A] ring-3 ring-[#14B8A6]/20 dark:border-[#475569] dark:bg-[#0F172A] dark:text-[#F1F5F9]">
                30
              </span>
              <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] sm:text-xs">
                Anything you haven&rsquo;t touched in a month is gone.
              </span>
            </div>
          </div>

          <div>
            <span className={`mb-1.5 block ${LABEL}`}>Run frequency</span>
            <div className="flex flex-wrap gap-1.5">
              <span className={PILL_OFF}>Daily</span>
              <span className={PILL_ON}>Weekly</span>
              <span className={PILL_OFF}>Monthly</span>
              <span className={PILL_OFF}>Never</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2.5 text-[11px] text-[#334155] dark:text-[#CBD5E1] sm:text-xs">
              <CheckedBox />
              Prompt me to confirm deletions
            </span>
            <span className="flex items-center gap-2.5 text-[11px] text-[#334155] dark:text-[#CBD5E1] sm:text-xs">
              <CheckedBox />
              Never auto-delete starred chats
            </span>
            <span className="flex items-center gap-2.5 text-[11px] text-[#64748B] dark:text-[#94A3B8] sm:text-xs">
              <span className="h-4 w-4 shrink-0 rounded-sm border-[1.5px] border-[#CBD5E1] bg-white dark:border-[#475569] dark:bg-[#0F172A]" />
              Save an activity log (counts only, never chat names)
            </span>
          </div>

          <div className="border-t border-[#F1F5F9] pt-2.5 dark:border-[#334155]">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B] dark:text-[#94A3B8]">
              Activity
            </p>
            <Bar label="Sep 14" width="w-28" count="23" muted="bg-[#0D9488]" />
            <Bar label="Sep 7" width="w-20" count="16" muted="bg-[#5EEAD4]" />
            <Bar label="Aug 31" width="w-11" count="9" muted="bg-[#99F6E4]" />
          </div>
        </div>
      </div>
    </div>
  );
}
