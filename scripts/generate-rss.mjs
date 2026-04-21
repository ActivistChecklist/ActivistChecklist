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

  const feed = new Feed({
    title: 'Activist Checklist - Recent Updates',
    description: 'Recent updates and improvements to Activist Checklist digital security guides',
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'en',
    image: `${SITE_URL}/images/logo-bg-white.png`,
    favicon: `${SITE_URL}/favicon.ico`,
    copyright: 'All rights reserved, Activist Checklist',
    updated: entries.length > 0 ? new Date(entries[0].frontmatter.date) : new Date(),
    generator: 'Activist Checklist RSS Generator',
    feedLinks: { rss2: `${SITE_URL}/rss/changelog.xml` },
    author: { name: 'Activist Checklist', email: 'contact@activistchecklist.org', link: SITE_URL },
  });

  for (const entry of entries) {
    const slug = entry.slug;
    const date = new Date(entry.frontmatter.date);
    const entryMarkdown = entry.content.trim() || 'Site update';
    const entryContent = await renderMarkdownToHtml(entryMarkdown);
    feed.addItem({
      title: slug,
      id: `${SITE_URL}/changelog#${slug}`,
      link: `${SITE_URL}/changelog#${slug}`,
      description: entryContent,
      content: entryContent,
      author: [{ name: 'Activist Checklist', email: 'contact@activistchecklist.org', link: SITE_URL }],
      date,
    });
  }

  writeFeed(feed, 'changelog.xml');
  return entries.length;
}

/**
 * Generate news RSS feed from MDX content files.
 */
async function generateNewsRSS() {
  const items = getAllNewsItems('en');

  const feed = new Feed({
    title: 'Activist Checklist - News',
    description: 'Latest news about digital security, surveillance, and activism',
    id: `${SITE_URL}/`,
    link: `${SITE_URL}/`,
    language: 'en',
    image: `${SITE_URL}/images/logo-bg-white.png`,
    favicon: `${SITE_URL}/favicon.ico`,
    copyright: 'All rights reserved, Activist Checklist',
    updated: items.length > 0 ? new Date(items[0].frontmatter.date) : new Date(),
    generator: 'Activist Checklist RSS Generator',
    feedLinks: { rss2: `${SITE_URL}/rss/news.xml` },
    author: { name: 'Activist Checklist', email: 'contact@activistchecklist.org', link: SITE_URL },
  });

  for (const item of items) {
    const fm = item.frontmatter;
    const date = new Date(fm.date);
    const canonicalArticleUrl = fm.url || `${SITE_URL}/news#${item.slug}`;
    const rssArticleUrl = applyPaywallBypassHref(canonicalArticleUrl);
    const source = fm.source || null;

    const tags = fm.tags ? String(fm.tags).split(',').map((t) => t.trim()).filter(Boolean) : [];
    let description = '';
    if (tags.length > 0) description += `<strong>Tags:</strong> ${tags.join(', ')}`;
    description += `<br><br><a href="${rssArticleUrl}">View the article here →</a>`;
    if (item.content.trim()) description += `<br><br>${item.content.trim()}`;

    feed.addItem({
      title: fm.title || 'News Item',
      id: canonicalArticleUrl,
      link: rssArticleUrl,
      description,
      content: description,
      author: [{ name: source || 'Activist Checklist', email: 'contact@activistchecklist.org', link: SITE_URL }],
      date,
    });
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
