import { Feed } from 'feed';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { applyPaywallBypassHref } from '../lib/paywall-bypass-url.js';
import { sectionStart, sectionEnd, detail } from './lib/build-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { getAllChangelogEntries, getAllNewsItems } = await import('../lib/content.js');

const SITE_URL = 'https://activistchecklist.org';
const DEFAULT_AUTHOR = { name: 'Activist Checklist', email: 'contact@activistchecklist.org', link: SITE_URL };

function absolutizeMarkdownLinks(markdown = '') {
  return String(markdown).replace(
    /\[([^\]]+)\]\((\/[^)\s]*)\)/g,
    (_match, text, href) => `[${text}](${SITE_URL}${href})`
  );
}

async function renderMarkdownToHtml(markdown = '') {
  const withAbsoluteLinks = absolutizeMarkdownLinks(markdown);
  const file = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(withAbsoluteLinks);
  return String(file).trim();
}

function createFeed({ title, description, feedPath, updated }) {
  return new Feed({
    title,
    description,
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'en',
    image: `${SITE_URL}/images/logo-bg-white.png`,
    favicon: `${SITE_URL}/favicon.ico`,
    copyright: 'All rights reserved, Activist Checklist',
    updated: updated || new Date(),
    generator: 'Activist Checklist RSS Generator',
    feedLinks: { rss2: `${SITE_URL}${feedPath}` },
    author: DEFAULT_AUTHOR,
  });
}

async function addMarkdownFeedItem(feed, item, markdown) {
  const renderedHtml = await renderMarkdownToHtml(markdown);
  feed.addItem({
    ...item,
    description: renderedHtml,
    content: renderedHtml,
  });
}

function writeFeed(feed, filename) {
  const outDir = path.join(ROOT, 'out', 'rss');
  fs.mkdirSync(outDir, { recursive: true });
  const rssPath = path.join(outDir, filename);
  fs.writeFileSync(rssPath, feed.rss2());
  detail(`Wrote ${path.relative(ROOT, rssPath)}`);
  return rssPath;
}

/**
 * Generate changelog RSS feed from MDX content files.
 */
async function generateChangelogRSS() {
  const entries = getAllChangelogEntries('en');

  const feed = createFeed({
    title: 'Activist Checklist - Recent Updates',
    description: 'Recent updates and improvements to Activist Checklist digital security guides',
    updated: entries.length > 0 ? new Date(entries[0].frontmatter.date) : new Date(),
    feedPath: '/rss/changelog.xml',
  });

  for (const entry of entries) {
    const slug = entry.slug;
    const date = new Date(entry.frontmatter.date);
    const entryMarkdown = entry.content.trim() || 'Site update';
    await addMarkdownFeedItem(feed, {
      title: slug,
      id: `${SITE_URL}/changelog#${slug}`,
      link: `${SITE_URL}/changelog#${slug}`,
      author: [DEFAULT_AUTHOR],
      date,
    }, entryMarkdown);
  }

  writeFeed(feed, 'changelog.xml');
  return entries.length;
}

/**
 * Generate news RSS feed from MDX content files.
 */
async function generateNewsRSS() {
  const items = getAllNewsItems('en');

  const feed = createFeed({
    title: 'Activist Checklist - News',
    description: 'Latest news about digital security, surveillance, and activism',
    updated: items.length > 0 ? new Date(items[0].frontmatter.date) : new Date(),
    feedPath: '/rss/news.xml',
  });

  for (const item of items) {
    const fm = item.frontmatter;
    const date = new Date(fm.date);
    const canonicalArticleUrl = fm.url || `${SITE_URL}/news#${item.slug}`;
    const rssArticleUrl = applyPaywallBypassHref(canonicalArticleUrl);
    const source = fm.source || null;

    const tags = fm.tags ? String(fm.tags).split(',').map((t) => t.trim()).filter(Boolean) : [];
    let descriptionMarkdown = '';
    if (tags.length > 0) descriptionMarkdown += `**Tags:** ${tags.join(', ')}`;
    descriptionMarkdown += `${descriptionMarkdown ? '\n\n' : ''}[View the article here →](${rssArticleUrl})`;
    if (item.content.trim()) descriptionMarkdown += `\n\n${item.content.trim()}`;
    await addMarkdownFeedItem(feed, {
      title: fm.title || 'News Item',
      id: canonicalArticleUrl,
      link: rssArticleUrl,
      author: [{ ...DEFAULT_AUTHOR, name: source || DEFAULT_AUTHOR.name }],
      date,
    }, descriptionMarkdown);
  }

  writeFeed(feed, 'news.xml');
  return items.length;
}

const feedType = process.argv[2];

sectionStart('📡', 'Generate RSS feeds');
detail(`Output: out/rss/`);

let changelogCount = 0;
let newsCount = 0;

if (feedType === 'news') {
  newsCount = await generateNewsRSS();
  sectionEnd(true, [`News feed: ${newsCount} item(s)`, 'changelog.xml skipped (news-only run)']);
} else if (feedType === 'changelog') {
  changelogCount = await generateChangelogRSS();
  sectionEnd(true, [`Changelog feed: ${changelogCount} entry(ies)`, 'news.xml skipped (changelog-only run)']);
} else {
  [changelogCount, newsCount] = await Promise.all([generateChangelogRSS(), generateNewsRSS()]);
  sectionEnd(true, [
    `Changelog: ${changelogCount} entry(ies)`,
    `News: ${newsCount} item(s)`,
  ]);
}

export { generateChangelogRSS, generateNewsRSS };
