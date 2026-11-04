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
 *   PDF_CHROMIUM_LIBS=dir  extra shared libraries for Chromium (Linux). Defaults
 *                     to ~/.local/lib/chromium-deps when that exists: the May
 *                     First server has no libnss3/libnspr4 and no root to
 *                     install them, so they are unpacked from Debian's .debs
 *                     there (apt-get download, then dpkg-deb -x).
 *
 * Usage: node scripts/build-pdfs.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { LOCALES } from '../lib/i18n-config.mjs';
import {
  normalizeHtmlForHash,
  pdfPaperFormat,
  pdfPathFor,
  planPdfBuild,
  shortenUrlForPrint,
} from '../lib/pdf-export.mjs';
import { NON_US_NOTICE_STORAGE_KEY } from '../lib/us-timezone.js';

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

// The site has no webfont for these scripts and leaves them to the visitor's
// system fonts (a Japanese webfont runs to several MB). A PDF can't rely on the
// build machine's fonts: the server's only Japanese font is Droid Sans Fallback,
// so the same guide would look different depending on where it was built. These
// fonts are devDependencies, loaded only while rendering that locale's PDFs.
const PDF_FONTS = {
  // Static weights, not the variable font: Chromium can't embed that one and
  // falls back to drawing each glyph, which made the PDFs five times larger.
  ja: {
    pkg: '@fontsource/noto-sans-jp',
    family: 'Noto Sans JP',
    weights: [400, 500, 600, 700],
  },
};
const FONT_ROUTE = '/__pdf-fonts/';

const fontDir = (locale) => path.dirname(require.resolve(`${PDF_FONTS[locale].pkg}/package.json`));

const PRINT_SOURCES = [
  'lib/pdf-export.mjs',
  'components/PrintEndnotes.js',
  'components/guides/PrintNotice.js',
  'hooks/use-is-printing.js',
];

/** Anything that changes how every PDF renders, folded into each hash. */
function renderSalt() {
  const versions = ['playwright', ...Object.values(PDF_FONTS).map((f) => f.pkg)].map(
    (pkg) => `${pkg}@${require(`${pkg}/package.json`).version}`,
  );
  return sha256(
    fs.readFileSync(__filename),
    // Print-only output the static HTML doesn't show: the JS bundle is left
    // out of the page hash, since its filenames change on every build.
    ...PRINT_SOURCES.map((file) => fs.readFileSync(path.join(ROOT, file))),
    ...versions,
  );
}

/**
 * The font package's @font-face rules, pointed at the local server, and font
 * stacks that try it right after the site's Latin fonts. Unlayered, so it wins
 * over the :root:lang(ja) stacks in globals.css.
 */
function pdfFontCss(locale) {
  const font = PDF_FONTS[locale];
  const faces = font.weights
    .map((w) => fs.readFileSync(path.join(fontDir(locale), `${w}.css`), 'utf8'))
    .join('\n')
    .replaceAll('url(./files/', `url(${FONT_ROUTE}${locale}/`);
  return `${faces}
:root {
  --font-heading: 'Libre Franklin', '${font.family}', sans-serif;
  --font-body: 'Source Sans 3', '${font.family}', sans-serif;
}`;
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
        hash: sha256(salt, body, assetHashes),
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
    if (urlPath.startsWith(FONT_ROUTE)) {
      // /__pdf-fonts/<locale>/<file>; basename keeps it inside the package
      const [locale, name = ''] = urlPath.slice(FONT_ROUTE.length).split('/');
      if (!Object.hasOwn(PDF_FONTS, locale)) {
        res.writeHead(404).end();
        return;
      }
      file = path.join(fontDir(locale), 'files', path.basename(name));
    } else if (file !== OUT_DIR && !file.startsWith(OUT_DIR + path.sep)) {
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

async function renderPdf(context, origin, target) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${origin}/${target.locale}/${target.slug}/`, {
      waitUntil: 'networkidle',
    });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);

    const canonical = await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      return document.querySelector('link[rel="canonical"]')?.href;
    });
    if (!canonical) throw new Error('page has no canonical URL');

    if (PDF_FONTS[target.locale]) await page.addStyleTag({ content: pdfFontCss(target.locale) });

    // Components that print differently (open collapsibles, the "this copy was
    // made on" notice, link endnotes) listen for beforeprint. Print media first, so they never
    // animate open in screen styles.
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

    // Resolve every link against the public URL. Left alone, relative links
    // would be baked into the PDF pointing at this throwaway localhost server.
    // After beforeprint, so links in sections that only open for print are
    // included. In-page #anchors stay as they are and become PDF-internal jumps.
    await page.evaluate((canonical) => {
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (href.startsWith('#')) continue;
        try {
          a.setAttribute('href', new URL(href, canonical).href);
        } catch {
          // leave as written
        }
      }
    }, canonical);

    // Lazy images below the fold never scroll into view in a headless page.
    await page.evaluate(async () => {
      const imgs = [...document.images];
      for (const img of imgs) img.loading = 'eager';
      await Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => null))));
      await document.fonts.ready;
    });

    // A missing font file fails silently into the system fallback, which is
    // exactly what bundling the font is meant to avoid.
    const pdfFont = PDF_FONTS[target.locale]?.family;
    if (
      pdfFont &&
      !(await page.evaluate(
        (family) =>
          [...document.fonts].some((f) => f.family.includes(family) && f.status === 'loaded'),
        pdfFont,
      ))
    ) {
      throw new Error(`${pdfFont} did not load`);
    }

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

/** Process env for Chromium, with PDF_CHROMIUM_LIBS on the library path. */
function chromiumEnv() {
  const libs =
    process.env.PDF_CHROMIUM_LIBS || path.join(os.homedir(), '.local', 'lib', 'chromium-deps');
  if (process.platform !== 'linux' || !fs.existsSync(libs)) return process.env;
  return {
    ...process.env,
    LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  };
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
    browser = await chromium.launch({ env: chromiumEnv() });
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
    // The "outside the US?" notice is picked per visitor from their browser's
    // timezone. A PDF is one copy for every reader, rendered on a server whose
    // timezone says nothing about them, so every page starts with it dismissed.
    await context.addInitScript((key) => {
      try {
        localStorage.setItem(key, 'true');
      } catch {
        // about:blank and aborted frames have no storage
      }
    }, NON_US_NOTICE_STORAGE_KEY);

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
    // next build already copied the cache in public/ to out/
    fs.rmSync(path.join(OUT_DIR, pdfPathFor(...key.split('/'))), { force: true });
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
    // Keep the date the PDF was rendered. A fresh copy date on every deploy
    // would change Last-Modified and the ETag, so a browser revalidating an
    // unchanged PDF would download it again instead of getting a 304.
    const { atime, mtime } = fs.statSync(src);
    fs.utimesSync(dest, atime, mtime);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} PDF(s) failed: ${failures.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(`build-pdfs: ${err.message}`);
  process.exit(1);
});
