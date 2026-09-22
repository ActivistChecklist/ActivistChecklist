import { Check, TriangleAlert } from 'lucide-react';
import { FaLinkedin } from 'react-icons/fa';
import { SiFacebook, SiInstagram, SiReddit, SiX, SiYoutube } from 'react-icons/si';

/**
 * Card-top previews for the homepage tool teaser.
 *
 * Not screenshots and not scaled-down copies of the full illustrations on
 * /tools/: at 230px wide their text would be four pixels tall and render as
 * mush. These are the one motif from each tool that survives being small, drawn
 * as shapes so the card reads at a glance and the four cards stay distinct from
 * each other. Product colors are hard-coded for the same reason as the full
 * illustrations: they belong to the tool, not to this site's theme.
 *
 * Decorative. Hidden from assistive tech and from the search index; the card's
 * name and description carry the meaning.
 */

const BAND = 'relative h-24 overflow-hidden border-b border-border';

function Frame({ className, children }) {
  return (
    <div className={`${BAND} ${className}`} aria-hidden="true" data-pagefind-ignore>
      {children}
    </div>
  );
}

/** A risk being dropped into the corner of the grid you have to plan for. */
function RiskMapperThumb() {
  const cells = [
    'bg-[#F1EDC4] dark:bg-[#45411F]',
    'bg-[#F3D9C0] dark:bg-[#4A3320]',
    'bg-[#EFC4C6] dark:bg-[#4C2528]',
    'bg-[#DCEBCE] dark:bg-[#2B441F]',
    'bg-[#F1EDC4] dark:bg-[#45411F]',
    'bg-[#F3D9C0] dark:bg-[#4A3320]',
    'bg-[#CFE6D6] dark:bg-[#1F3F2C]',
    'bg-[#DCEBCE] dark:bg-[#2B441F]',
    'bg-[#F1EDC4] dark:bg-[#45411F]',
  ];
  return (
    <Frame>
      <span className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {cells.map((tone, i) => (
          <span key={i} className={tone} />
        ))}
      </span>
      <span className="absolute right-2.5 top-1/2 w-[62%] -translate-y-1/2 -rotate-2 rounded-md border border-l-[3px] border-[#E0B3B5] border-l-[#C0392B] bg-white px-2 py-1.5 text-[10px] font-medium leading-tight text-[#0B081B] shadow-md dark:border-[#3A3A44] dark:border-l-[#C0392B] dark:bg-[#1A1A21] dark:text-[#E7ECF7]">
        Phone seized at the action
      </span>
    </Frame>
  );
}

/**
 * The list of platforms, ticked off one at a time. The row is wider than the
 * frame on purpose: the cut-off logos on the right edge are the point, since the
 * real list runs to 130 sites and a tidy row of six would undersell it.
 */
const PLATFORMS = [
  { name: 'Facebook', Icon: SiFacebook, color: 'text-[#1877F2]', done: true },
  { name: 'Instagram', Icon: SiInstagram, color: 'text-[#E1306C]', done: true },
  { name: 'LinkedIn', Icon: FaLinkedin, color: 'text-[#0A66C2]', done: true },
  { name: 'X', Icon: SiX, color: 'text-[#F3F5F9]', done: true },
  { name: 'YouTube', Icon: SiYoutube, color: 'text-[#FF0000]', done: false },
  { name: 'Reddit', Icon: SiReddit, color: 'text-[#FF4500]', done: false },
];

function SocialScrubThumb() {
  const rows = [PLATFORMS.slice(0, 3), PLATFORMS.slice(3)];
  return (
    <Frame className="flex flex-col justify-center gap-1.5 bg-[#0B0E14] pl-3">
      {rows.map((row, i) => (
        <span key={i} className="flex w-max gap-1.5">
          {row.map(({ name, Icon, color, done }) => (
            <span
              key={name}
              className={`flex w-[104px] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 ${
                done ? 'border-[#1F4632] bg-[#0C1410]' : 'border-[#242A36] bg-[#12161F]'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
              <span className="grow truncate text-[10px] font-medium text-[#C9D1E0]">{name}</span>
              {done && <Check className="h-3 w-3 shrink-0 text-[#22C55E]" strokeWidth={3} />}
            </span>
          ))}
        </span>
      ))}
    </Frame>
  );
}

/**
 * The answer nobody wants, in the words the page uses. Device and date are
 * pinned by hand: iPhone X, security support ended 2025-03-31 per
 * endoflife.date. See UpdateCheckerShot for why this must never name a model
 * that is still supported.
 */
function UpdateCheckerThumb() {
  return (
    <Frame className="flex items-center bg-background px-3">
      <span className="flex w-full items-center gap-2 rounded-md border-2 border-destructive/45 bg-destructive/5 px-2.5 py-2">
        <TriangleAlert className="h-5 w-5 shrink-0 text-error" />
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-bold text-foreground">iPhone X</span>
          <span className="block truncate text-[10px] text-foreground/70">
            No security updates since March 2025
          </span>
        </span>
      </span>
    </Frame>
  );
}

/** The rule, and the chats it is about to take. */
function AutoDeleteThumb() {
  return (
    <Frame className="flex flex-col justify-center gap-1.5 bg-[#F8FAFC] px-3 dark:bg-[#0F172A]">
      <span className="w-fit rounded-full bg-[#0D9488] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
        Older than 30 days
      </span>
      <span className="truncate text-[11px] text-[#64748B] line-through decoration-[#0D9488] decoration-2 dark:text-[#94A3B8]">
        Meeting notes, Mar 2
      </span>
      <span className="truncate text-[11px] text-[#64748B] line-through decoration-[#0D9488] decoration-2 dark:text-[#94A3B8]">
        Press release draft
      </span>
    </Frame>
  );
}

const THUMBS = {
  riskMapper: RiskMapperThumb,
  socialScrub: SocialScrubThumb,
  updates: UpdateCheckerThumb,
  autoDelete: AutoDeleteThumb,
};

export default function ToolThumb({ toolKey }) {
  const Thumb = THUMBS[toolKey];
  return Thumb ? <Thumb /> : null;
}
