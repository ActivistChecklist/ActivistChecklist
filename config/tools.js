import { Laptop, Smartphone } from 'lucide-react';

/**
 * The tools we build alongside the checklists, in the order they appear on
 * /tools/ and in the homepage teaser. Shared so the two surfaces can't drift
 * apart on names, links or order. `homepage: false` keeps a tool on /tools/
 * but off the homepage, which only has room for a few cards.
 *
 * Copy lives in messages/en.json under `tools.items.<key>`.
 *
 * `screenshot` is a 2x capture of the real tool; width and height are in CSS
 * pixels. The homepage card shows a 16:9 crop of it, or of `cardImage` when a
 * tool has one, and `thumbPosition` picks which part shows. Re-take a
 * screenshot when its tool's UI changes noticeably.
 */
export const TOOLS = [
  {
    key: 'updates',
    id: 'update-checker',
    href: '/updates/',
    screenshot: { src: '/images/tools/update-checker.webp', width: 720, height: 1064 },
    thumbPosition: 'object-[center_45%]',
  },
  {
    key: 'riskMapper',
    id: 'risk-mapper',
    href: 'https://riskmapper.app',
    screenshot: { src: '/images/tools/risk-mapper.webp', width: 1024, height: 970 },
    thumbPosition: 'object-bottom',
  },
  {
    key: 'autoDelete',
    id: 'ai-chat-auto-delete',
    href: 'https://activistchecklist.github.io/ai-chat-history-auto-delete-extension/',
    screenshot: { src: '/images/tools/ai-chat-auto-delete.webp', width: 640, height: 835 },
    // The chat list from the extension's own landing page shows what it does
    // better than its settings do at card size.
    cardImage: { src: '/images/tools/ai-chat-auto-delete-card.webp', width: 632, height: 389 },
    thumbPosition: 'object-center',
    homepage: false,
  },
];

/**
 * The passcode and passphrase generators. They are pages on this site with no
 * screenshot to show, so they get one small block of links on /tools/ and on
 * the homepage instead of a place in TOOLS. `key` is the page's namespace in
 * messages/en.json: both blocks reuse the page's own title (and /tools/ its
 * intro), so the links can't drift from the pages.
 */
export const GENERATORS = [
  { key: 'passcodeGenerator', href: '/passcode/', Icon: Smartphone },
  { key: 'passphraseGenerator', href: '/passphrase/', Icon: Laptop },
];

/** The tools with a card in the homepage teaser. */
export const HOMEPAGE_TOOLS = TOOLS.filter((tool) => tool.homepage !== false);

/**
 * Every page the homepage teaser links to, so other homepage blocks can leave
 * them out rather than show them twice.
 */
export const HOMEPAGE_TOOL_HREFS = new Set(
  [...HOMEPAGE_TOOLS, ...GENERATORS].map((tool) => tool.href),
);

export const TOOLS_HREF = '/tools/';
