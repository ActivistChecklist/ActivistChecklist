import { Search, TriangleAlert, X, Settings } from 'lucide-react';

/**
 * Illustration of the /updates checker after a search comes back unsupported.
 *
 * Unlike the other three, this tool is part of this site, so the illustration is
 * built from our own semantic tokens and follows the reader's light/dark theme,
 * which is exactly what they'd see if they clicked through.
 *
 * The sample device is not a live lookup, so every fact in it is pinned by hand
 * and has to stand on its own: iPhone X, released 2017, security support ended
 * 2025-03-31, and iPhone 11 is the oldest model Apple still maintains (iOS 26).
 * All from endoflife.date, the same source the real page uses, checked
 * 2026-09-22.
 *
 * Always pick a device that is comfortably past end of support. An earlier
 * version of this used the iPhone 11, which is still maintained, so the
 * illustration told readers a safe phone was unsafe, and its advice line said
 * "iPhone XS or newer" months after the XS went end of life. Re-check against
 * endoflife.date when Apple's supported floor moves.
 */
export default function UpdateCheckerShot() {
  return (
    <div className="flex flex-col gap-3 bg-background p-3 sm:gap-4 sm:p-5">
      <div>
        <span className="mb-1.5 block text-[11px] font-bold text-foreground sm:text-xs">
          Type your device model
        </span>
        <div className="flex items-center gap-2 rounded-lg border border-input px-2.5 py-2 ring-3 ring-primary/15">
          <Search className="h-4 w-4 shrink-0 text-primary" />
          <span className="grow truncate text-sm font-semibold text-foreground">iPhone X</span>
          <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-primary sm:inline">
            Phone · released 2017
          </span>
          <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border-2 border-destructive/45 bg-destructive/5 p-3 sm:gap-3 sm:p-4">
        <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-error sm:h-7 sm:w-7" />
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold leading-snug tracking-tight text-foreground sm:text-xl">
            iPhone X stopped receiving security updates{' '}
            <span className="whitespace-nowrap rounded-sm bg-mark pl-1 pr-0.5">1 year ago</span>.
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/80 sm:text-sm">
            Security support ended <strong className="text-foreground">March 2025</strong>. Every
            flaw found since then is public and unfixed on this phone.
          </p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-primary/45 bg-primary/5 p-3 sm:p-4">
        <h4 className="font-heading text-sm font-bold text-foreground sm:text-base">
          What to do about it
        </h4>
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="rounded-md border border-border bg-background p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              If you can replace it
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground sm:text-[13px]">
              Any iPhone 11 or newer is still supported. A refurbished one costs less than most
              people expect.
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              If you can&rsquo;t, yet
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground sm:text-[13px]">
              Don&rsquo;t take it to an action, and don&rsquo;t use it for organizing chats. Read{' '}
              <span className="text-primary underline underline-offset-2">Protest prep</span> and{' '}
              <span className="text-primary underline underline-offset-2">Spyware</span>.
            </p>
          </div>
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground/80 sm:text-xs">
          <Settings className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            Check which version you&rsquo;re on:{' '}
            <strong className="text-foreground">
              Settings &rarr; General &rarr; About &rarr; Software Version
            </strong>
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground">
          Check another device
        </span>
        <span className="text-[11px] text-muted-foreground">Source: endoflife.date</span>
      </div>
    </div>
  );
}
