import { ArrowRight, UserRound } from 'lucide-react';

/**
 * Illustration of socialscrub.app working through step 1 of 8 on an account.
 * See BrowserFrame for why these are hand-built rather than screenshots. Social
 * Scrub ships a dark interface only, so this illustration stays dark in both of
 * our themes, the same way a real screenshot of it would.
 */

const DONE_STEP = 'bg-[#22C55E] text-[#06210F]';
const TODO_STEP = 'border border-[#2B303C] bg-[#171B24] text-[#6B7488]';

function Step({ n, done }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold sm:h-[22px] sm:w-[22px] sm:text-[11px] ${
        done ? DONE_STEP : TODO_STEP
      }`}
    >
      {n}
    </span>
  );
}

function Rail() {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
        <span key={n} className="flex min-w-0 grow items-center last:grow-0">
          <Step n={n} done={n === 1} />
          {n < 8 && <span className="h-0.5 grow bg-[#262B36]" />}
        </span>
      ))}
    </div>
  );
}

export default function SocialScrubShot() {
  return (
    <div className="bg-[#0B0E14] pb-4">
      <div className="flex items-center gap-2 border-b border-[#1C202A] px-3 py-2.5 sm:px-4">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1877F2] font-heading text-sm font-extrabold text-white">
          f
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-bold text-[#4ADE80] sm:text-[13px]">Facebook</span>
          <span className="text-[10px] text-[#8A93A5]">Step 1 of 8</span>
        </span>
        <span className="grow" />
        <span className="hidden text-[10px] text-[#8A93A5] sm:inline">Auto-saved locally</span>
        <span className="rounded-md border border-[#2B303C] px-2 py-1 text-[10px] font-semibold text-[#C9D1E0]">
          Dashboard
        </span>
      </div>

      <div className="px-3 pt-4 sm:px-5">
        <Rail />
      </div>

      <div className="px-3 pt-4 sm:px-5">
        <h3 className="font-heading text-lg font-extrabold leading-tight tracking-tight text-[#F3F5F9] sm:text-[22px]">
          Change your display name <span className="text-[#4ADE80]">on Facebook</span>
        </h3>
        <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[#9AA3B4] sm:text-xs">
          Your real name links your profile to public records, property filings and relatives. Swap
          it for something that doesn&rsquo;t.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="grow rounded-lg bg-[#22C55E] py-2 text-center text-xs font-bold text-[#06210F] sm:text-[13px]">
            I did this
          </span>
          <span className="grow rounded-lg border border-[#2D323E] py-2 text-center text-xs font-semibold text-[#C9D1E0] sm:text-[13px]">
            Skip
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1rem_1fr] items-center px-3 pt-4 sm:px-5">
        <div className="rounded-xl border border-[#4A2226] bg-[#140E10] p-2.5">
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#F98080]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
            Before
          </span>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="h-8 w-8 shrink-0 rounded-full bg-linear-to-br from-[#7C5C3E] to-[#C99A6B]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate rounded-sm border border-[#EF4444]/50 bg-[#EF4444]/20 px-1 text-[11px] font-bold text-[#F3F5F9] sm:text-xs">
                Alex Rivera
              </span>
              <span className="truncate text-[10px] text-[#8A93A5]">@alexrivera</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#C08C8C]">
            Anyone can search your name and find you.
          </p>
        </div>
        <ArrowRight className="mx-auto h-3.5 w-3.5 text-[#6B7488]" />
        <div className="rounded-xl border border-[#1F4632] bg-[#0C1410] p-2.5">
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#6EE7A0]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
            After
          </span>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-[#6B7488]">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate rounded-sm border border-[#22C55E]/50 bg-[#22C55E]/20 px-1 text-[11px] font-bold text-[#F3F5F9] sm:text-xs">
                John Doe
              </span>
              <span className="truncate text-[10px] text-[#8A93A5]">@happy-dolphin-742</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#79A98C]">
            Your profile stops showing up in name searches.
          </p>
        </div>
      </div>
    </div>
  );
}
