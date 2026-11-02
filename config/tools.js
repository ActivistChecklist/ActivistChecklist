import { LayoutGrid, Smartphone, Trash2 } from 'lucide-react';

/**
 * The tools we build alongside the checklists, in the order they appear on
 * /tools/ and in the homepage teaser. Shared so the two surfaces can't drift
 * apart on names, links or order.
 *
 * Copy lives in messages/en.json under `tools.items.<key>`. `accent` colors the
 * icon only: on the alternating `bg-muted` panels on /tools/, primary lands
 * near 4.1:1, which passes the 3:1 graphics threshold but fails for small
 * colored text.
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
    href: 'https://activistchecklist.github.io/ai-chat-history-auto-delete-extension/',
    shotUrl: 'AI chat auto-delete · Settings',
  },
];

export const TOOLS_HREF = '/tools/';
