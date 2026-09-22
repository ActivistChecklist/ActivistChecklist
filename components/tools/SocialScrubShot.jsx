import { MapPin, UserRound } from 'lucide-react';
import SimpleImage from '@/components/SimpleImage';

/**
 * Illustration of what Social Scrub does to a profile: the same sample account
 * before and after the eight steps. The sample persona and the photos are the
 * ones socialscrub.app itself uses, copied from ActivistChecklist/social-scrub
 * and resized. See BrowserFrame for why these are hand-built rather than
 * screenshots. Social Scrub ships a dark interface only, so this stays dark in
 * both of our themes, the same way a real screenshot of it would.
 */

const CARD = 'rounded-xl border p-2.5 sm:p-3';
const BEFORE_CARD = `${CARD} border-[#4A2226] bg-[#140E10]`;
const AFTER_CARD = `${CARD} border-[#1F4632] bg-[#0C1410]`;

const ROW = 'border-t border-[#FFFFFF1A] pt-2 mt-2';
/** Floors that keep each section level across the two columns: the scrubbed
 *  side is always the shorter one, and drifting labels make it harder to read. */
const ROW_BIO = `${ROW} min-h-[3.25rem]`;
const ROW_FRIENDS = `${ROW} min-h-[5.25rem]`;
const ROW_POSTS = `${ROW} hidden min-h-[7rem] sm:block`;
const KEY = 'text-[9px] font-bold uppercase tracking-wider text-[#6B7488]';
const VAL = 'mt-0.5 text-[11px] leading-snug text-[#E7ECF7]';
const GONE = 'mt-0.5 text-[11px] leading-snug italic text-[#6B7488]';

/** Fields the scrub changes are boxed, the way the real before/after marks them. */
const HIT = 'rounded-sm border px-1';
const HIT_BAD = `${HIT} border-[#EF4444]/50 bg-[#EF4444]/20`;
const HIT_OK = `${HIT} border-[#22C55E]/50 bg-[#22C55E]/20`;

function Heading({ tone }) {
  const before = tone === 'before';
  return (
    <span
      className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider ${
        before ? 'text-[#F98080]' : 'text-[#6EE7A0]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${before ? 'bg-[#EF4444]' : 'bg-[#22C55E]'}`} />
      {before ? 'Before' : 'After'}
    </span>
  );
}

function Friend({ src, name }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <SimpleImage
        src={src}
        alt=""
        width="16"
        height="16"
        className="h-4 w-4 shrink-0 rounded-full object-cover"
      />
      <span className="truncate text-[10px] text-[#C9D1E0]">{name}</span>
    </span>
  );
}

export default function SocialScrubShot() {
  return (
    <div className="bg-[#0B0E14] p-2.5 sm:p-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {/* BEFORE */}
        <div className={BEFORE_CARD}>
          <Heading tone="before" />

          <div className="mt-2.5 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <SimpleImage
              src="/images/tools/social-scrub-luke.jpg"
              alt=""
              width="40"
              height="40"
              className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={`max-w-full self-start truncate text-[11px] font-bold text-[#F3F5F9] sm:text-xs ${HIT_BAD}`}>
                Luke Skywalker
              </span>
              <span className={`max-w-full self-start truncate text-[10px] text-[#C9D1E0] ${HIT_BAD}`}>
                @lukeskywalker
              </span>
            </span>
          </div>

          <div className={ROW_BIO}>
            <span className={KEY}>Bio</span>
            <p className={VAL}>
              <span className={HIT_BAD}>Tatooine</span> native, organizer at{' '}
              <span className={HIT_BAD}>Rebel Alliance</span>
            </p>
          </div>

          <div className={ROW}>
            <span className={KEY}>Account</span>
            <p className={VAL}>847 posts, 1.2K friends, public</p>
            <p className={`${VAL} truncate`}>
              <span className={HIT_BAD}>luke@gmail.com</span>
            </p>
          </div>

          <div className={ROW_FRIENDS}>
            <span className={KEY}>Friends (244)</span>
            <div className="mt-1 flex flex-col gap-1">
              <Friend src="/images/tools/social-scrub-han.jpg" name="Han Solo" />
              <Friend src="/images/tools/social-scrub-leia.jpg" name="Leia Organa" />
              <Friend src="/images/tools/social-scrub-obiwan.jpg" name="Obi-Wan Kenobi" />
            </div>
          </div>

          <div className={ROW_POSTS}>
            <span className={KEY}>Recent posts</span>
            <p className={`${VAL} flex items-start gap-1`}>
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#F98080]" />
              <span className={HIT_BAD}>Tagged at Mos Eisley Cantina</span>
            </p>
            <p className={VAL}>
              &ldquo;Just started my new job at <span className={HIT_BAD}>Acme Corp</span>{' '}
              downtown. The office on <span className={HIT_BAD}>5th &amp; Main</span> has the best
              coffee...&rdquo;
            </p>
          </div>

          <p className="mt-2.5 text-[10px] leading-snug text-[#C08C8C]">
            Enough here to find your address, your job, and who you organize with.
          </p>
        </div>

        {/* AFTER */}
        <div className={AFTER_CARD}>
          <Heading tone="after" />

          <div className="mt-2.5 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1F2937] text-[#6B7488] sm:h-11 sm:w-11">
              <UserRound className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={`max-w-full self-start truncate text-[11px] font-bold text-[#F3F5F9] sm:text-xs ${HIT_OK}`}>
                John Doe
              </span>
              <span className={`max-w-full self-start truncate text-[10px] text-[#C9D1E0] ${HIT_OK}`}>
                @happy-dolphin-742
              </span>
            </span>
          </div>

          <div className={ROW_BIO}>
            <span className={KEY}>Bio</span>
            <p className={GONE}>Removed</p>
          </div>

          <div className={ROW}>
            <span className={KEY}>Account</span>
            <p className={VAL}>12 posts, friends hidden, private</p>
            <p className={`${VAL} truncate`}>
              <span className={HIT_OK}>luke+ig@grr.la</span>
            </p>
          </div>

          <div className={ROW_FRIENDS}>
            <span className={KEY}>Friends</span>
            <p className={GONE}>Friends list is private</p>
            <p className="mt-1 text-[10px] leading-snug text-[#6B7488]">
              Only you can see who you are connected to.
            </p>
          </div>

          <div className={ROW_POSTS}>
            <span className={KEY}>Recent posts</span>
            <p className={`${GONE} flex items-start gap-1`}>
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#6B7488]" />
              Location removed
            </p>
            <p className={GONE}>Post deleted</p>
          </div>

          <p className="mt-2.5 text-[10px] leading-snug text-[#79A98C]">
            Nothing left that ties the account back to you.
          </p>
        </div>
      </div>
    </div>
  );
}
