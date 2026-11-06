#!/usr/bin/env node
/**
 * Render designed PDFs (posters and the like) in each language they publish.
 *
 * Unlike the guide PDFs (scripts/build-pdfs.mjs), these are not a printout of
 * a site page. Each one is its own design, filled with text from a translatable
 * file, so Crowdin can translate the words and the build lays them out again.
 *
 *   content/<locale>/pdf/<slug>.json   the words. English is the Crowdin source
 *                                      and sets the structure; Crowdin writes the
 *                                      other languages.
 *   config/pdfs.mjs                    everything else, including which
 *                                      languages to publish
 *   lib/pdf/layouts/<layout>.mjs       the design, as HTML and CSS
 *
 * Output, keyed by a hash of everything that changes it, so an unchanged PDF
 * never starts a browser:
 *   public/files/pdf/<locale>/<slug>.pdf   cache, gitignored; also lets `pnpm dev` serve them
 *   public/files/pdf/<locale>/<slug>.webp  preview image, a screenshot of the same page
 *                                          right after it was printed, so it always
 *                                          matches the PDF
 *   .designed-pdf-cache.json               hash per PDF, gitignored
 *   out/files/pdf/<locale>/<slug>.*        what ships, copied when out/ exists
 *
 * Options:
 *   --only <slug>      just this PDF
 *   --locale <code>    just this language
 *   --force            ignore the cache (also PDF_EXPORT_FORCE=1)
 *   --html <dir>       also write each page's HTML there, for debugging
 *
 * PDF_EXPORT=off skips this script, as it does the guide PDFs. Chromium setup
 * (PDF_CHROMIUM_LIBS on the server) is described in scripts/build-pdfs.mjs.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { parseArgs } from 'util';
import sharp from 'sharp';

import { DEFAULT_LOCALE, LOCALES } from '../lib/i18n-config.mjs';
import { pdfPaperFormat, planPdfBuild } from '../lib/pdf-export.mjs';
import { localizeContent } from '../lib/pdf/content.mjs';
import { PDFS } from '../config/pdfs.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const LAYOUT_DIR = path.join(ROOT, 'lib', 'pdf', 'layouts');
const VENDOR_FONT_DIR = path.join(ROOT, 'lib', 'pdf', 'fonts');
const CACHE_DIR = path.join(ROOT, 'public', 'files', 'pdf');
const OUT_DIR = path.join(ROOT, 'out', 'files', 'pdf');
const MANIFEST_PATH = path.join(ROOT, '.designed-pdf-cache.json');
const SITE_URL = 'https://activistchecklist.org';
// Only route.fulfill() answers this host; nothing is ever fetched from it.
const ORIGIN = 'https://pdf.invalid';

const require = createRequire(import.meta.url);

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    locale: { type: 'string' },
    force: { type: 'boolean', default: false },
    html: { type: 'string' },
  },
});

if (process.env.PDF_EXPORT === 'off') {
  console.log('PDF_EXPORT=off, skipping designed PDFs');
  process.exit(0);
}

// Paper sizes in CSS px (96 per inch).
const PAPER = {
  Letter: { width: 816, height: 1056 },
  A4: { width: 793.7, height: 1122.52 },
};

// Scripts the layouts' Latin fonts don't cover. Same font the guide PDFs use
// for Japanese, so a PDF never depends on what the build machine has.
// `displayWeight` stands in for the heavy display face (Bebas Neue), which has
// only one weight and would be faked bold if asked for a heavier one.
const LOCALE_FONTS = {
  ja: {
    family: 'Noto Sans JP',
    pkg: '@fontsource/noto-sans-jp',
    weights: [400, 700],
    displayWeight: 700,
  },
};

const sha256 = (...parts) => {
  const h = crypto.createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// ── Fonts ────────────────────────────────────────────────────────────────

const pkgDir = (pkg) => path.dirname(require.resolve(`${pkg}/package.json`));

/** URL path prefix for a font's files, and the directory it maps to. */
function fontRoute(font) {
  if (font.file) return { prefix: '/fonts/vendor/', dir: VENDOR_FONT_DIR };
  const id = font.pkg.replace(/^@fontsource\//, '');
  return { prefix: `/fonts/${id}/`, dir: path.join(pkgDir(font.pkg), 'files') };
}

/** @font-face rules for a list of fonts, and every file they can load. */
function fontFaces(list) {
  const css = [];
  const files = [];
  for (const font of list) {
    const { prefix, dir } = fontRoute(font);
    if (font.file) {
      css.push(`@font-face {
  font-family: '${font.family}';
  font-weight: ${font.weight};
  font-style: normal;
  src: url(${prefix}${font.file});
}`);
      files.push(path.join(dir, font.file));
      continue;
    }
    for (const weight of font.weights) {
      const rules = fs
        .readFileSync(path.join(pkgDir(font.pkg), `${weight}.css`), 'utf8')
        .replaceAll('url(./files/', `url(${prefix}`);
      css.push(rules);
      if (weight === font.displayWeight) {
        css.push(
          rules
            .replaceAll(`font-family: '${font.family}'`, `font-family: '${font.family} Display'`)
            .replaceAll(`font-weight: ${weight}`, 'font-weight: 400'),
        );
      }
      for (const m of rules.matchAll(/url\(([^)]+\.woff2)\)/g)) {
        files.push(path.join(dir, path.basename(m[1])));
      }
    }
  }
  return { css: css.join('\n'), files, routes: list.map(fontRoute) };
}

// ── Targets ──────────────────────────────────────────────────────────────

// Same layout as designedPdfPath() and designedPreviewPath() in lib/pdf/catalog.mjs.
const OUTPUTS = ['pdf', 'webp'];
const pdfFile = (dir, locale, slug, ext = 'pdf') => path.join(dir, locale, `${slug}.${ext}`);
// The preview shows at up to 448 CSS px wide; 1.5x the page gives ~1200 px, sharp on retina.
const PREVIEW_SCALE = 1.5;

async function loadLayout(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad layout name "${name}"`);
  const file = path.join(LAYOUT_DIR, `${name}.mjs`);
  return { file, layout: await import(file) };
}

function pageHref(locale, pagePath) {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${SITE_URL}${prefix}${pagePath}`;
}

async function collectTargets() {
  const slugs = Object.keys(PDFS).filter((slug) => !args.only || slug === args.only);
  if (args.only && slugs.length === 0) throw new Error(`no "${args.only}" in config/pdfs.mjs`);

  const salt = sha256(
    fs.readFileSync(__filename),
    fs.readFileSync(path.join(ROOT, 'lib', 'pdf', 'content.mjs')),
    `playwright@${require('playwright/package.json').version}`,
  );

  const targets = [];
  for (const slug of slugs) {
    const config = PDFS[slug];
    const { file: layoutFile, layout } = await loadLayout(config.layout);
    const source = readJson(path.join(ROOT, 'content', DEFAULT_LOCALE, 'pdf', `${slug}.json`));

    for (const locale of config.locales) {
      if (args.locale && locale !== args.locale) continue;
      const contentFile = path.join(ROOT, 'content', locale, 'pdf', `${slug}.json`);
      // The site links every listed language, so a missing one is a broken link.
      if (!Object.hasOwn(LOCALES, locale))
        throw new Error(`${slug}: "${locale}" is not a site locale`);
      if (!fs.existsSync(contentFile)) {
        throw new Error(
          `${slug}: ${locale} is listed in config/pdfs.mjs but has no ${contentFile}`,
        );
      }

      const { content, missing } = localizeContent(source, readJson(contentFile));
      if (missing.length > 0) {
        console.log(
          `  ! ${locale}/${slug}: ${missing.length} string(s) in English: ${missing.join(', ')}`,
        );
      }

      const extra = LOCALE_FONTS[locale];
      const faces = fontFaces(extra ? [...layout.fonts, extra] : layout.fonts);
      const paper = PAPER[pdfPaperFormat(locale)];
      const html = layout.renderPosterHtml({
        content,
        config,
        lang: LOCALES[locale].intlLocale,
        href: pageHref(locale, config.pagePath),
        paper,
        fontCss: faces.css,
        fallbackFont: extra ? `'${extra.family}'` : null,
        fallbackDisplayFont: extra?.displayWeight ? `'${extra.family} Display'` : null,
      });

      const fontHash = faces.files.map((f) => sha256(fs.readFileSync(f))).join('');
      targets.push({
        key: `${locale}/${slug}`,
        locale,
        slug,
        html,
        paper,
        routes: faces.routes,
        hash: sha256(salt, fs.readFileSync(layoutFile), html, fontHash),
      });
    }
  }
  return targets;
}

// ── Rendering ────────────────────────────────────────────────────────────

const FONT_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

async function renderPdf(context, target) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({
      width: Math.ceil(target.paper.width),
      height: Math.ceil(target.paper.height),
    });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.abort();
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: target.html });
      }
      const font = target.routes.find((r) => url.pathname.startsWith(r.prefix));
      // basename keeps the request inside the font's own directory
      const file = font && path.join(font.dir, path.basename(url.pathname));
      const type = file && FONT_TYPES[path.extname(file)];
      if (!type || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });

    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);

    // A missing font file falls back to a system font without an error,
    // which is the one thing bundling the fonts is meant to rule out.
    const failed = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
    );
    if (failed.length > 0) throw new Error(`fonts failed to load: ${[...new Set(failed)]}`);

    const fit = await page.evaluate(() => window.fitPoster());

    const pdf = await page.pdf({
      width: `${target.paper.width}px`,
      height: `${target.paper.height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      tagged: true,
    });
    const shot = await page.locator('.sheet').screenshot({ type: 'png' });
    const preview = await sharp(shot).webp({ quality: 82 }).toBuffer();
    return { pdf, preview, fit };
  } finally {
    await page.close();
  }
}

/** Process env for Chromium; see PDF_CHROMIUM_LIBS in scripts/build-pdfs.mjs. */
function chromiumEnv() {
  const libs =
    process.env.PDF_CHROMIUM_LIBS || path.join(os.homedir(), '.local', 'lib', 'chromium-deps');
  if (process.platform !== 'linux' || !fs.existsSync(libs)) return process.env;
  return {
    ...process.env,
    LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
}

async function renderAll(stale, manifest) {
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch({ env: chromiumEnv() });
  } catch (err) {
    throw new Error(
      `could not start Chromium: ${err.message.split('\n')[0]}\n` +
        '  Install it with: pnpm exec playwright install chromium-headless-shell\n' +
        '  Or skip PDFs for this build with PDF_EXPORT=off',
    );
  }
  const failures = [];
  try {
    const context = await browser.newContext({
      colorScheme: 'light',
      deviceScaleFactor: PREVIEW_SCALE,
    });
    for (const target of stale) {
      const started = Date.now();
      try {
        const { pdf, preview, fit } = await renderPdf(context, target);
        writeAtomic(pdfFile(CACHE_DIR, target.locale, target.slug, 'pdf'), pdf);
        writeAtomic(pdfFile(CACHE_DIR, target.locale, target.slug, 'webp'), preview);
        manifest[target.key] = target.hash;
        const shrunk = Object.entries(fit.zooms)
          .filter(([, z]) => z !== 1)
          .map(([col, z]) => `${col} at ${Math.round(z * 100)}%`);
        console.log(
          `  ✓ ${target.key} (${Math.round(pdf.length / 1024)} KB, ${Date.now() - started} ms, ` +
            `title ${fit.titleSize}px${shrunk.length ? `, ${shrunk.join(', ')}` : ''})`,
        );
      } catch (err) {
        failures.push(target.key);
        console.error(`  ✗ ${target.key}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  return failures;
}

// ── Main ─────────────────────────────────────────────────────────────────

function readManifest() {
  if (args.force || process.env.PDF_EXPORT_FORCE === '1') return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).entries ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const targets = await collectTargets();

  if (args.html) {
    for (const t of targets)
      writeAtomic(path.join(args.html, `${t.locale}-${t.slug}.html`), t.html);
  }

  const manifest = readManifest();
  const { stale, fresh, orphaned } = planPdfBuild(targets, manifest, (key) =>
    OUTPUTS.every((ext) => fs.existsSync(pdfFile(CACHE_DIR, ...key.split('/'), ext))),
  );
  // A partial run (--only, --locale) sees only some targets, so it must not
  // treat the rest as deleted.
  if (!args.only && !args.locale) {
    for (const key of orphaned) {
      delete manifest[key];
      for (const ext of OUTPUTS) {
        fs.rmSync(pdfFile(CACHE_DIR, ...key.split('/'), ext), { force: true });
        fs.rmSync(pdfFile(OUT_DIR, ...key.split('/'), ext), { force: true });
      }
    }
  }

  console.log(
    `Designed PDFs: ${targets.length} total, ${fresh.length} unchanged, ${stale.length} to render`,
  );
  const failures = stale.length > 0 ? await renderAll(stale, manifest) : [];
  writeAtomic(MANIFEST_PATH, `${JSON.stringify({ version: 1, entries: manifest }, null, 2)}\n`);

  if (fs.existsSync(path.dirname(OUT_DIR))) {
    for (const { locale, slug } of targets) {
      for (const ext of OUTPUTS) {
        const src = pdfFile(CACHE_DIR, locale, slug, ext);
        if (!fs.existsSync(src)) continue;
        const dest = pdfFile(OUT_DIR, locale, slug, ext);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        // Keep the render date, so an unchanged file keeps its Last-Modified/ETag.
        const { atime, mtime } = fs.statSync(src);
        fs.utimesSync(dest, atime, mtime);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} PDF(s) failed: ${failures.join(', ')}`);
  }
}

main().catch((err) => {
  console.error(`build-designed-pdfs: ${err.message}`);
  process.exit(1);
});
