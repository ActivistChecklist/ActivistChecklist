import { Check, Star } from 'lucide-react';

/**
 * Illustration of riskmapper.app mid-session. See BrowserFrame for why these are
 * hand-built rather than screenshots, and why the colors are hard-coded.
 */

const CARD = 'bg-white dark:bg-[#101015]';
const HEAD_CELL =
  'bg-[#FAFAFC] text-[#3F3F46] dark:bg-[#17171C] dark:text-[#C9D1E0]';
const CHIP_BASE =
  'rounded-md border border-l-[3px] bg-white px-1.5 py-1 text-[11px] leading-snug text-[#0B081B] shadow-xs dark:bg-[#1A1A21] dark:text-[#E7ECF7] sm:px-2 sm:text-xs';

const CHIP_TONE = {
  yellow: 'border-[#DCD7A8] border-l-[#C9A227] dark:border-[#3A3A44] dark:border-l-[#C9A227]',
  orange: 'border-[#E3C7A8] border-l-[#D2711F] dark:border-[#3A3A44] dark:border-l-[#D2711F]',
  red: 'border-[#E0B3B5] border-l-[#C0392B] dark:border-[#3A3A44] dark:border-l-[#C0392B]',
};

const CELL_TONE = {
  green: 'bg-[#CFE6D6] dark:bg-[#1F3F2C]',
  lightGreen: 'bg-[#DCEBCE] dark:bg-[#2B441F]',
  yellow: 'bg-[#F1EDC4] dark:bg-[#45411F]',
  orange: 'bg-[#F3D9C0] dark:bg-[#4A3320]',
  red: 'bg-[#EFC4C6] dark:bg-[#4C2528]',
};

function Chip({ tone, children }) {
  return <div className={`${CHIP_BASE} ${CHIP_TONE[tone]}`}>{children}</div>;
}

function Cell({ tone, children }) {
  return (
    <div
      className={`${CELL_TONE[tone]} min-h-[3.75rem] border-t border-[#E8E8EE] p-1.5 dark:border-[#26262E] sm:min-h-[4.75rem] sm:p-2`}
    >
      {children}
    </div>
  );
}

function RowLabel({ children }) {
  return (
    <div
      className={`${HEAD_CELL} flex items-center justify-center border-t border-r border-[#E8E8EE] dark:border-[#26262E]`}
    >
      <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-bold">{children}</span>
    </div>
  );
}

function StepBar({ step, children }) {
  return (
    <div className="flex items-center gap-2 bg-[#146C55] px-3 py-2">
      <span className="rounded-sm bg-[#A8DCC8] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#0B3E31]">
        {step}
      </span>
      <span className="text-xs font-semibold text-white sm:text-[13px]">{children}</span>
    </div>
  );
}

export default function RiskMapperShot() {
  return (
    <div className={`${CARD} p-3 sm:p-4`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-sm bg-linear-to-br from-[#2E8B72] to-[#E8C24A]" />
        <span className="text-xs font-bold text-[#0B081B] dark:text-[#E7ECF7]">March 14 rally</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#BFE3D5] bg-[#E6F4EE] px-2 py-0.5 text-[10px] font-semibold text-[#146C55] dark:border-[#1F4D3E] dark:bg-[#0E2A22] dark:text-[#6FCBAC]">
          <Check className="h-2.5 w-2.5" />
          Saved locally
        </span>
        <span className="grow" />
        <span className="hidden rounded-sm border border-[#E0E0E6] px-2 py-0.5 text-[10px] font-semibold text-[#5C5C66] dark:border-[#33333C] dark:text-[#9A9AA6] sm:inline">
          PDF
        </span>
        <span className="hidden rounded-sm bg-[#146C55] px-2 py-0.5 text-[10px] font-semibold text-white sm:inline">
          Share
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-[#DEDDE4] dark:border-[#26262E]">
        <StepBar step="STEP 2">Drag the risks into the matrix</StepBar>
        <div className="grid grid-cols-[1.5rem_repeat(3,minmax(0,1fr))] sm:grid-cols-[1.75rem_repeat(3,minmax(0,1fr))]">
          <div className={`${HEAD_CELL} border-r border-[#E8E8EE] dark:border-[#26262E]`} />
          <div className={`${HEAD_CELL} border-r border-[#E8E8EE] px-1 py-1.5 text-center text-[10px] font-bold dark:border-[#26262E] sm:text-[11px]`}>
            Low impact
          </div>
          <div className={`${HEAD_CELL} border-r border-[#E8E8EE] px-1 py-1.5 text-center text-[10px] font-bold dark:border-[#26262E] sm:text-[11px]`}>
            Medium impact
          </div>
          <div className={`${HEAD_CELL} px-1 py-1.5 text-center text-[10px] font-bold sm:text-[11px]`}>
            High impact
          </div>

          <RowLabel>High</RowLabel>
          <Cell tone="yellow">
            <Chip tone="yellow">Someone livestreams a marshal&rsquo;s face</Chip>
          </Cell>
          <Cell tone="orange">
            <Chip tone="orange">Organizer&rsquo;s home address posted online</Chip>
          </Cell>
          <Cell tone="red">
            <Chip tone="red">Phone seized and unlocked at the action</Chip>
          </Cell>

          <RowLabel>Medium</RowLabel>
          <Cell tone="lightGreen" />
          <Cell tone="yellow">
            <Chip tone="yellow">Ride-share falls through</Chip>
          </Cell>
          <Cell tone="orange">
            <Chip tone="orange">Legal support line goes unanswered</Chip>
          </Cell>

          <RowLabel>Low</RowLabel>
          <Cell tone="green" />
          <Cell tone="lightGreen" />
          <Cell tone="yellow">
            <Chip tone="yellow">Venue cancels the day before</Chip>
          </Cell>
        </div>
      </div>

      {/* Three columns of prose don't survive a 375px screen, and the matrix
          above is the part of this tool worth showing. */}
      <div className="mt-3 hidden overflow-hidden rounded-md border border-[#DEDDE4] dark:border-[#26262E] sm:block">
        <StepBar step="STEP 3">Star what you&rsquo;ll act on</StepBar>
        <div className="grid grid-cols-[1.1fr_1.2fr_1.2fr] text-[10px] sm:text-[11px]">
          <div className={`${HEAD_CELL} border-r border-[#ECECF1] px-2 py-1.5 font-bold dark:border-[#26262E]`}>
            Risk
          </div>
          <div className={`${HEAD_CELL} border-r border-[#ECECF1] px-2 py-1.5 font-bold dark:border-[#26262E]`}>
            Make it less likely
          </div>
          <div className={`${HEAD_CELL} px-2 py-1.5 font-bold`}>Limit the harm</div>

          <div className="border-t border-r border-[#ECECF1] px-2 py-2 font-semibold leading-snug text-[#0B081B] dark:border-[#26262E] dark:text-[#E7ECF7]">
            Phone seized and unlocked
          </div>
          <div className="flex gap-1.5 border-t border-r border-[#ECECF1] px-2 py-2 leading-snug text-[#3F3F46] dark:border-[#26262E] dark:text-[#B8BCC8]">
            <Star className="mt-px h-3 w-3 shrink-0 fill-[#C9A227] text-[#C9A227]" />
            Leave the daily phone at home, bring a burner
          </div>
          <div className="flex gap-1.5 border-t border-[#ECECF1] px-2 py-2 leading-snug text-[#3F3F46] dark:border-[#26262E] dark:text-[#B8BCC8]">
            <Star className="mt-px h-3 w-3 shrink-0 fill-[#C9A227] text-[#C9A227]" />
            Disappearing messages on, legal number memorized
          </div>
        </div>
      </div>
    </div>
  );
}
