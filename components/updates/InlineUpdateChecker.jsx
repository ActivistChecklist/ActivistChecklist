'use client';

import { useEffect, useState } from 'react';

import Link from '@/components/Link';
import { useChecklistItem } from '@/contexts/ChecklistItemContext';
import { UpdateChecker } from './UpdatesPage';

// The checker needs JavaScript to load its device list, so without it there is
// nothing to show. A <noscript> style rather than a media query, because Tor
// Browser's safest mode blocks scripts in a way the `scripting` media feature
// doesn't report (same approach as the passcode generator).
const hideWithoutJs = (
  <noscript>
    <style>{'[data-update-checker]{display:none}'}</style>
  </noscript>
);

/**
 * The /updates/ checker, inline in a checklist item (the `<UpdateChecker />` MDX
 * tag). It renders the page's own components in their compact variant, so both
 * stay in step.
 *
 * Checklist item bodies stay mounted while collapsed, so the checker waits until
 * its item has been opened before it loads the device list. Otherwise every guide
 * view would download it.
 */
export default function InlineUpdateChecker() {
  const item = useChecklistItem();
  // Outside a checklist item there is nothing to wait for.
  const expanded = item ? item.expanded : true;
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (expanded) setActive(true);
  }, [expanded]);

  return (
    <>
      {/* A printed guide can't run the checker, so point readers at it instead. */}
      <p className="hidden print:block">
        <Link href="/updates/">activistchecklist.org/updates/</Link>
      </p>
      <div data-update-checker data-pagefind-ignore className="not-prose my-4 print:hidden">
        {hideWithoutJs}
        {active ? <UpdateChecker inline /> : null}
      </div>
    </>
  );
}
