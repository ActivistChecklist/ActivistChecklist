import { LayoutGrid, Smartphone, Trash2, UserX } from 'lucide-react';

/**
 * The tools we build alongside the checklists, in the order they appear on
 * /tools/ and in the homepage teaser. Shared so the two surfaces can't drift
 * apart on names, links or order.
 *
 * Copy lives in messages/en.json under `tools.items.<key>`. `accent` colors the
 * icon only: on the alternating `bg-muted` panels on /tools/, primary and
 * success both land near 4.1:1, which passes the 3:1 graphics threshold but
 * fails for small colored text.
 *
 * `secondaryHref` is optional. Only Social Scrub has one, because the doxxing
 * checklist is the thing you actually want to read alongside it.
 */
export const TOOLS = [
  {
    key: 'riskMapper',
    id: 'risk-mapper',
    icon: LayoutGrid,
    accent: 'text-primary',
    href: 'https://riskmapper.app',
    shotUrl: 'riskmapper.app',
  },
  {
    key: 'socialScrub',
    id: 'social-scrub',
    icon: UserX,
    accent: 'text-success',
    href: 'https://socialscrub.app',
    secondaryHref: '/doxxing/',
    shotUrl: 'socialscrub.app',
  },
  {
    key: 'updates',
    id: 'update-checker',
    icon: Smartphone,
    accent: 'text-error',
    href: '/updates/',
    shotUrl: 'activistchecklist.org/updates',
  },
  {
    key: 'autoDelete',
    id: 'ai-chat-auto-delete',
    icon: Trash2,
    accent: 'text-info',
    href: 'https://chromewebstore.google.com/detail/ai-chat-history-auto-dele/ipmoefogkkpbgpbniklknonnmbmcbnpk',
    shotUrl: 'AI chat auto-delete · Settings',
  },
];

export const TOOLS_HREF = '/tools/';
