/**
 * The tools we build alongside the checklists, in the order they appear on
 * /tools/ and in the homepage teaser. Shared so the two surfaces can't drift
 * apart on names, links or order.
 *
 * Copy lives in messages/en.json under `tools.items.<key>`. `accent` colors the
 * check marks only: on the alternating `bg-muted` panels on /tools/, primary
 * lands near 4.1:1, which passes the 3:1 graphics threshold but fails for small
 * colored text.
 *
 * `screenshot` is a 2x capture of the real tool; width and height are in CSS
 * pixels. The homepage card shows a 16:9 crop of it, or of `cardImage` when a
 * tool has one, and `thumbPosition` picks which part shows. Re-take a
 * screenshot when its tool's UI changes noticeably.
 */
export const TOOLS = [
  {
    key: 'riskMapper',
    id: 'risk-mapper',
    accent: 'text-primary',
    href: 'https://riskmapper.app',
    screenshot: { src: '/images/tools/risk-mapper.webp', width: 1024, height: 970 },
    thumbPosition: 'object-bottom',
  },
  {
    key: 'updates',
    id: 'update-checker',
    accent: 'text-error',
    href: '/updates/',
    screenshot: { src: '/images/tools/update-checker.webp', width: 720, height: 1064 },
    thumbPosition: 'object-[center_45%]',
  },
  {
    key: 'autoDelete',
    id: 'ai-chat-auto-delete',
    accent: 'text-info',
    href: 'https://activistchecklist.github.io/ai-chat-history-auto-delete-extension/',
    screenshot: { src: '/images/tools/ai-chat-auto-delete.webp', width: 640, height: 835 },
    // The chat list from the extension's own landing page shows what it does
    // better than its settings do at card size.
    cardImage: { src: '/images/tools/ai-chat-auto-delete-card.webp', width: 632, height: 389 },
    thumbPosition: 'object-center',
  },
];

export const TOOLS_HREF = '/tools/';
