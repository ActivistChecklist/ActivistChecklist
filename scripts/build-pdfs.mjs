#!/usr/bin/env node
/**
 * Render every guide in out/ to a downloadable PDF using the site's own print
 * stylesheet, so the PDF is the page and there is no second layout to maintain.
 *
 * Runs from postbuild.sh for static builds. Each PDF is keyed by a hash of what
 * would change its output (the page's rendered body, the bytes of the CSS and
 * images it uses, and this script itself). Unchanged guides are copied from the
 * cache without starting a browser; a build where nothing changed never
 * launches Chromium at all.
 *
 *   public/pdf/<locale>/<slug>.pdf  cache, gitignored; also lets `pnpm dev` serve them
 *   .pdf-cache.json                 hash per PDF, gitignored
 *   out/pdf/<locale>/<slug>.pdf     what ships
 *
 * Env:
 *   PDF_EXPORT=off    skip entirely (next.config.js also hides the download link)
 *   PDF_EXPORT_FORCE=1  ignore the cache and re-render everything
 *
 * Usage: node scripts/build-pdfs.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { LOCALES } from '../lib/i18n-config.mjs';
import {
  assignEndnotes,
  normalizeHtmlForHash,
  pdfPaperFormat,
  pdfPathFor,
  planPdfBuild,
  shortenUrlForPrint,
} from '../lib/pdf-export.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT_DIR = path.join(ROOT, 'out');
const CACHE_DIR = path.join(ROOT, 'public');
const MANIFEST_PATH = path.join(ROOT, '.pdf-cache.json');
const CONCURRENCY = 4;

const require = createRequire(import.meta.url);

if (process.env.PDF_EXPORT === 'off') {
  console.log('PDF_EXPORT=off, skipping guide PDFs');
  process.exit(0);
}

// ── Targets ──────────────────────────────────────────────────────────────

function sha256(...parts) {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

/** Anything that changes how every PDF renders, folded into each hash. */
function renderSalt() {
  const playwrightVersion = require('playwright/package.json').version;
  return sha256(
    fs.readFileSync(__filename),
    fs.readFileSync(path.join(ROOT, 'lib', 'pdf-export.mjs')),
    playwrightVersion,
  );
}

async function listGuideSlugs() {
  const { getAllGuides } = await import('../lib/content.js');
  const slugs = new Set();
  for (const locale of Object.keys(LOCALES)) {
    for (const g of getAllGuides(locale)) slugs.add(g.frontmatter.slug || g.slug);
  }
  return [...slugs].sort();
}

function readAsset(urlPath) {
  const file = path.join(OUT_DIR, decodeURIComponent(urlPath.split(/[?#]/)[0]));
  if (!file.startsWith(OUT_DIR + path.sep)) return '';
  try {
    return fs.readFileSync(file);
  } catch {
    return '';
  }
}

function collectTargets(slugs, salt) {
  const targets = [];
  for (const locale of Object.keys(LOCALES)) {
    for (const slug of slugs) {
      const htmlFile = path.join(OUT_DIR, locale, slug, 'index.html');
      if (!fs.existsSync(htmlFile)) continue;
      const { body, assetPaths } = normalizeHtmlForHash(fs.readFileSync(htmlFile, 'utf8'));
      const assetHashes = assetPaths.map((p) => `${p}:${sha256(readAsset(p))}`).join('\n');
      targets.push({
        key: `${locale}/${slug}`,
        locale,
        slug,
        hash: sha256(salt, body, assetHashes, linksHeading(locale)),
      });
    }
  }
  return targets;
}

const cacheFile = (key) => path.join(CACHE_DIR, `${pdfPathFor(...key.split('/'))}`);

function readManifest() {
  if (process.env.PDF_EXPORT_FORCE === '1') return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).entries ?? {};
  } catch {
    return {};
  }
}

function writeManifest(entries) {
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
  fs.renameSync(tmp, MANIFEST_PATH);
}

// ── Local server for out/ ────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.join(OUT_DIR, urlPath);
    if (file !== OUT_DIR && !file.startsWith(OUT_DIR + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ── Rendering ────────────────────────────────────────────────────────────

const escapeHtml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/**
 * Chromium draws this in the bottom margin of every page. It is rendered in
 * its own document, so it cannot see the site's fonts or CSS.
 */
function footerTemplate(displayUrl) {
  return `
    <div style="width:100%; margin:0 1.3cm; display:flex; justify-content:space-between;
                font-family:-apple-system, 'Helvetica Neue', Arial, sans-serif;
                font-size:8px; color:#666;">
      <span>${escapeHtml(displayUrl)}</span>
      <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
}

/** "Links in this guide", in the PDF's language when Crowdin has translated it. */
function linksHeading(locale) {
  for (const loc of [locale, 'en']) {
    try {
      const messages = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'messages', `${loc}.json`), 'utf8'),
      );
      const heading = messages.printNotice?.linksHeading;
      if (heading) return heading;
    } catch {
      // fall through to English
    }
  }
  return 'Links';
}

/**
 * Replace inline "(url)" text with a superscript number on each link and a
 * numbered list of URLs at the end. Runs after print media and beforeprint, so
 * it only numbers links the PDF actually shows (opened FAQs included, print:hidden
 * buttons excluded). Block links such as guide cards are skipped: they are
 * clickable, and a footnote marker on a whole card reads as noise.
 */
async function addEndnotes(page, canonical, heading) {
  const hrefs = await page.evaluate(() => {
    const links = [...document.querySelectorAll('main a[href^="http"]:not(.no-print-url)')].filter(
      (a) => a.getClientRects().length > 0 && getComputedStyle(a).display.startsWith('inline'),
    );
    links.forEach((a, i) => a.setAttribute('data-endnote-index', String(i)));
    return links.map((a) => a.getAttribute('href'));
  });
  const { refs, notes } = assignEndnotes(hrefs, canonical);
  if (notes.length === 0) return;

  await page.evaluate(
    ({ refs, notes, heading }) => {
      for (const a of document.querySelectorAll('[data-endnote-index]')) {
        const n = refs[Number(a.getAttribute('data-endnote-index'))];
        if (!n) continue;
        const sup = document.createElement('sup');
        sup.className = 'pdf-endnote-ref';
        sup.textContent = String(n);
        a.after(sup);
      }

      const section = document.createElement('section');
      section.className = 'pdf-endnotes';
      const h2 = document.createElement('h2');
      h2.textContent = heading;
      const ol = document.createElement('ol');
      for (const note of notes) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = note.href;
        a.textContent = note.text;
        li.append(a);
        ol.append(li);
      }
      section.append(h2, ol);
      document.querySelector('main').append(section);
    },
    { refs, notes, heading },
  );
}

async function renderPdf(context, origin, target) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${origin}/${target.locale}/${target.slug}/`, {
      waitUntil: 'networkidle',
    });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);

    const { canonical, hrefs } = await page.evaluate(() => {
      document.documentElement.classList.add('pdf-export');
      document.documentElement.classList.remove('dark');
      return {
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        hrefs: [
          ...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))),
        ],
      };
    });
    if (!canonical) throw new Error('page has no canonical URL');

    // Resolve every link against the public URL. Left alone, relative links
    // would be baked into the PDF pointing at this throwaway localhost server.
    const links = hrefs.map((href) => {
      if (href.startsWith('#')) return { href, absolute: href, printUrl: null };
      let absolute = href;
      try {
        absolute = new URL(href, canonical).href;
      } catch {
        // leave as written
      }
      return { href, absolute };
    });
    await page.evaluate((links) => {
      const byHref = new Map(links.map((l) => [l.href, l.absolute]));
      for (const a of document.querySelectorAll('a[href]')) {
        const absolute = byHref.get(a.getAttribute('href'));
        if (absolute) a.setAttribute('href', absolute);
      }
    }, links);

    // Components that print differently (open collapsibles, the "this copy was
    // made on" notice) listen for beforeprint. Print media first, so they never
    // animate open in screen styles.
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

    await addEndnotes(page, canonical, linksHeading(target.locale));

    // Lazy images below the fold never scroll into view in a headless page.
    await page.evaluate(async () => {
      const imgs = [...document.images];
      for (const img of imgs) img.loading = 'eager';
      await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
      await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: pdfPaperFormat(target.locale),
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(
        shortenUrlForPrint(canonical, 'https://invalid/') ?? canonical,
      ),
      margin: { top: '0.9cm', bottom: '1.4cm', left: '0.9cm', right: '0.9cm' },
      outline: true,
      tagged: true,
    });

    const dest = cacheFile(target.key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.tmp`, pdf);
    fs.renameSync(`${dest}.tmp`, dest);
    return pdf.length;
  } finally {
    await page.close();
  }
}

async function renderAll(stale, manifest) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    throw new Error(`playwright is not installed (${err.message})`);
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw new Error(
      `could not start Chromium: ${err.message.split('\n')[0]}\n` +
        '  Install it with: pnpm exec playwright install chromium-headless-shell\n' +
        '  (Linux may also need: pnpm exec playwright install-deps chromium)\n' +
        '  Or skip PDFs for this build with PDF_EXPORT=off',
    );
  }

  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const failures = [];
  try {
    const context = await browser.newContext({ colorScheme: 'light', locale: 'en-US' });
    // Nothing outside out/ should load: no analytics, no third-party embeds.
    await context.route('**/*', (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort(),
    );

    const queue = [...stale];
    const worker = async () => {
      for (let target = queue.shift(); target; target = queue.shift()) {
        const started = Date.now();
        try {
          const bytes = await renderPdf(context, origin, target);
          manifest[target.key] = target.hash;
          writeManifest(manifest);
          console.log(
            `  ✓ ${target.key} (${Math.round(bytes / 1024)} KB, ${Date.now() - started} ms)`,
          );
        } catch (err) {
          failures.push(target.key);
          console.error(`  ✗ ${target.key}: ${err.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    server.close();
    await browser.close();
  }
  return failures;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUT_DIR)) throw new Error('out/ not found; run a static build first');

  const targets = collectTargets(await listGuideSlugs(), renderSalt());
  const manifest = readManifest();
  const { stale, fresh, orphaned } = planPdfBuild(targets, manifest, (key) =>
    fs.existsSync(cacheFile(key)),
  );

  for (const key of orphaned) {
    delete manifest[key];
    fs.rmSync(cacheFile(key), { force: true });
  }

  console.log(
    `Guide PDFs: ${targets.length} total, ${fresh.length} unchanged, ${stale.length} to render`,
  );

  let failures = [];
  if (stale.length > 0) failures = await renderAll(stale, manifest);
  writeManifest(manifest);

  for (const { key } of targets) {
    const src = cacheFile(key);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(OUT_DIR, pdfPathFor(...key.split('/')));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} PDF(s) failed: ${failures.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(`build-pdfs: ${err.message}`);
  process.exit(1);
});
