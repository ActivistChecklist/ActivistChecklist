import { ArrowRight, Check, UserRound } from 'lucide-react';
import { FaLinkedin } from 'react-icons/fa';
import { SiFacebook, SiInstagram, SiReddit, SiX, SiYoutube } from 'react-icons/si';
import SimpleImage from '@/components/SimpleImage';

/**
 * Illustration of socialscrub.app: the platform list on the left with your place
 * in it, and what the eight steps do to one profile on the right. Brand glyphs
 * come from react-icons, the same approach as the homepage card preview, so the
 * two surfaces speak the same visual language.
 *
 * The sample persona and photos are the ones socialscrub.app itself uses, copied
 * from ActivistChecklist/social-scrub and resized. See BrowserFrame for why these
 * are hand-built rather than screenshots. Social Scrub ships a dark interface
 * only, so this stays dark in both of our themes, the same way a real screenshot
 * of it would.
 */

const PLATFORMS = [
  { name: 'Facebook', Icon: SiFacebook, color: 'text-[#1877F2]', status: 'done' },
  { name: 'Instagram', Icon: SiInstagram, color: 'text-[#E1306C]', status: 'done' },
  { name: 'LinkedIn', Icon: FaLinkedin, color: 'text-[#0A66C2]', status: 'partial' },
  { name: 'X / Twitter', Icon: SiX, color: 'text-[#F3F5F9]', status: 'todo' },
  { name: 'YouTube', Icon: SiYoutube, color: 'text-[#FF0000]', status: 'todo' },
  { name: 'Reddit', Icon: SiReddit, color: 'text-[#FF4500]', status: 'todo' },
];

const SHELL = {
  done: 'border-[#1F4632] bg-[#0C1410]',
  partial: 'border-[#4A401F] bg-[#14120A]',
  todo: 'border-[#242A36] bg-[#12161F]',
};

const KEY = 'text-[9px] font-bold uppercase tracking-wider text-[#6B7488]';

function Badge({ status }) {
  if (status === 'done') {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#22C55E] px-1.5 py-0.5 text-[9px] font-bold text-[#06210F]">
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />8 of 8
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="shrink-0 rounded-full bg-[#FACC15] px-1.5 py-0.5 text-[9px] font-bold text-[#2A2005]">
        4 of 8
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-[#2B303C] px-1.5 py-0.5 text-[9px] font-semibold text-[#8A93A5]">
      To do
    </span>
  );
}

function Profile({ tone, children }) {
  const before = tone === 'before';
  return (
    <div
      className={`rounded-xl border p-2.5 ${
        before ? 'border-[#4A2226] bg-[#140E10]' : 'border-[#1F4632] bg-[#0C1410]'
      }`}
    >
      <span
        className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider ${
          before ? 'text-[#F98080]' : 'text-[#6EE7A0]'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${before ? 'bg-[#EF4444]' : 'bg-[#22C55E]'}`} />
        {before ? 'Before' : 'After'}
      </span>
      {children}
    </div>
  );
}

export default function SocialScrubShot() {
  return (
    <div className="bg-[#0B0E14] p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-sm bg-[#22C55E]" />
        <span className="text-xs font-bold text-[#F3F5F9]">Your platforms</span>
        <span className="grow" />
        <span className="hidden text-[10px] text-[#8A93A5] sm:inline">Auto-saved locally</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-1.5">
          {PLATFORMS.map(({ name, Icon, color, status }) => (
            <span
              key={name}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${SHELL[status]}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />
              <span className="grow truncate text-[11px] font-medium text-[#E7ECF7] sm:text-xs">
                {name}
              </span>
              <Badge status={status} />
            </span>
          ))}
          <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#1B2029]">
            <span className="block h-full w-[52%] rounded-full bg-[#22C55E]" />
          </span>
          <span className="text-[10px] text-[#8A93A5]">
            20 of 40 steps done. Pick it back up whenever.
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <Profile tone="before">
            <div className="mt-2 flex items-center gap-2">
              <SimpleImage
                src="/images/tools/social-scrub-luke.jpg"
                alt=""
                width="36"
                height="36"
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[11px] font-bold text-[#F3F5F9]">Luke Skywalker</span>
                <span className="truncate text-[10px] text-[#8A93A5]">@lukeskywalker</span>
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-[#E7ECF7]">
              Tatooine native, organizer at Rebel Alliance
            </p>
            <div className="mt-2 flex items-center gap-1">
              <span className={KEY}>244 friends</span>
              <span className="flex -space-x-1">
                {['han', 'leia', 'obiwan'].map((who) => (
                  <SimpleImage
                    key={who}
                    src={`/images/tools/social-scrub-${who}.jpg`}
                    alt=""
                    width="16"
                    height="16"
                    className="h-4 w-4 rounded-full object-cover ring-1 ring-[#140E10]"
                  />
                ))}
              </span>
            </div>
          </Profile>

          <ArrowRight className="mx-auto h-3.5 w-3.5 shrink-0 rotate-90 text-[#6B7488]" />

          <Profile tone="after">
            <div className="mt-2 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-[#6B7488]">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[11px] font-bold text-[#F3F5F9]">John Doe</span>
                <span className="truncate text-[10px] text-[#8A93A5]">@happy-dolphin-742</span>
              </span>
            </div>
            <p className="mt-2 text-[10px] italic leading-snug text-[#6B7488]">Bio removed</p>
            <div className="mt-2">
              <span className={KEY}>Friends list is private</span>
            </div>
          </Profile>
        </div>
      </div>
    </div>
  );
}
