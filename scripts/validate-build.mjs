#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import chalk from 'chalk';
import {
  getAllGuides,
  getAllPages,
  getAllNewsItems,
} from '../lib/content.js';
import { LOCALES, DEFAULT_LOCALE } from '../lib/i18n-config.mjs';
import { sectionStart, sectionEnd, subsection, detail } from './lib/build-cli.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out');
const CONTENT_DIR = path.join(ROOT, 'content');
const MESSAGES_DIR = path.join(ROOT, 'messages');
const CONTENT_FLOOR = Number(process.env.VALIDATE_BUILD_HTML_FLOOR || 30);
const REQUIRE_BODY_MATCH = process.env.VALIDATE_BUILD_REQUIRE_BODY === '1';
const INDEX_ROUTES = ['', 'news', 'changelog', 'checklists', 'contact'];

function normalizeText(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, '/')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLooseText(value = '') {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function preview(value = '', max = 180) {
  const compact = String(value).replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function firstDiffIndex(a = '', b = '') {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  if (a.length !== b.length) return max;
  return -1;
}

function findActualExcerpt(haystackLoose = '', needleLoose = '') {
  if (!haystackLoose) return '';
  const search = needleLoose || '';
  let idx = -1;
  if (search.length >= 8) {
    const token = search.split(' ').find((t) => t.length >= 8) || '';
    if (token) idx = haystackLoose.indexOf(token);
  }
  if (idx < 0 && search.length >= 4) {
    idx = haystackLoose.indexOf(search.slice(0, 4));
  }
  if (idx < 0) idx = 0;
  return haystackLoose.slice(idx, idx + 140).trim();
}

function toSearchProbe(value = '', maxWords = 12) {
  const words = String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function buildMissingContentMessage({
  description,
  expected,
  filePath,
  sourcePath,
  sourceLine,
  normalizedNeedle,
  looseNeedle,
  haystackLoose,
}) {
  const expectedLoose = preview(looseNeedle || normalizedNeedle, 140);
  const actualLoose = preview(findActualExcerpt(haystackLoose, looseNeedle), 140);
  return {
    type: 'content-miss',
    description,
    outputFile: path.relative(ROOT, filePath),
    sourceFile: sourcePath ? path.relative(ROOT, sourcePath) : null,
    sourceLine: sourceLine ? preview(sourceLine, 180) : null,
    expectedRaw: preview(expected, 180),
    expectedNormalized: preview(normalizedNeedle, 180),
    expectedLoose,
    actualLoose,
  };
}

function stripInlineMarkdown(line) {
  return line
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractBodyStringFromMdx(mdxContent) {
  const lines = String(mdxContent).split('\n');
  let inFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^(#|>|- |\* |\|)/.test(line)) continue;
    if (/^(import|export)\s/.test(line)) continue;
    if (line.startsWith('<') || line.startsWith('{') || line === '---') continue;

    const plain = stripInlineMarkdown(line);
    if (plain.length >= 20) return plain;
  }

  return null;
}

function parseMdxFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  return { frontmatter: data || {}, content: content || '' };
}

function contentPath(locale, collection, slugFromFilename) {
  return path.join(CONTENT_DIR, locale, collection, `${slugFromFilename}.mdx`);
}

function routePath(locale, routeSlug) {
  return path.join(OUT_DIR, locale, routeSlug, 'index.html');
}

function rootEnglishRoutePath(routeSlug) {
  return path.join(OUT_DIR, routeSlug, 'index.html');
}

function exists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function assertFile(filePath, description, failures) {
  if (!exists(filePath)) {
    failures.push(`${description}: missing ${path.relative(ROOT, filePath)}`);
    return false;
  }
  return true;
}

function getMissingContentMessage(filePath, expected, description, context = {}) {
  if (!expected) return null;
  const html = fs.readFileSync(filePath, 'utf8');
  const haystack = normalizeText(html);
  const haystackLoose = normalizeLooseText(html);
  const needle = normalizeText(expected);
  const needleLoose = normalizeLooseText(expected);
  if (!needle) return null;
  if (haystack.includes(needle)) return null;
  if (needleLoose && haystackLoose.includes(needleLoose)) return null;

  return buildMissingContentMessage({
    description,
    expected,
    filePath,
    sourcePath: context.sourcePath,
    sourceLine: context.sourceLine,
    normalizedNeedle: needle,
    looseNeedle: needleLoose,
    haystackLoose,
  });
}

function assertContains(filePath, expected, description, failures, context = {}) {
  const missingMessage = getMissingContentMessage(filePath, expected, description, context);
  if (missingMessage) failures.push(missingMessage);
}

function checkBodyContains(filePath, expected, description, failures, warnings, context = {}) {
  const missingMessage = getMissingContentMessage(filePath, expected, description, context);
  if (!missingMessage) return;
  if (REQUIRE_BODY_MATCH) {
    failures.push(missingMessage);
  } else {
    warnings.push({
      ...missingMessage,
      severity: 'soft-body-miss',
    });
  }
}

function getVerificationStringsFromParsed(parsed) {
  const title = String(parsed?.frontmatter?.title || '').trim() || null;
  const bodyFromContent = extractBodyStringFromMdx(parsed?.content || '');
  const fallback =
    String(parsed?.frontmatter?.excerpt || parsed?.frontmatter?.preview || '').trim() || null;
  const body = bodyFromContent || fallback || null;
  const bodyProbe = body ? toSearchProbe(body) : null;
  const bodyOrigin = bodyFromContent ? 'body_line' : (fallback ? 'frontmatter_fallback' : null);
  return { title, body, bodyProbe, bodyOrigin };
}

function collectAllHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectAllHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getSourceForLocale({ locale, collection, item }) {
  const localePath = contentPath(locale, collection, item.slug);
  const hasLocaleFile = fs.existsSync(localePath);
  if (hasLocaleFile) {
    return {
      parsed: parseMdxFile(localePath),
      isTranslated: locale !== DEFAULT_LOCALE,
      source: localePath,
    };
  }

  const fallbackPath = contentPath(DEFAULT_LOCALE, collection, item.slug);
  return {
    parsed: parseMdxFile(fallbackPath),
    isTranslated: false,
    source: fallbackPath,
  };
}

function getByPath(obj, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function getHomepageExpectedText(locale) {
  const messagesPath = path.join(MESSAGES_DIR, `${locale}.json`);
  if (!fs.existsSync(messagesPath)) return null;

  try {
    const raw = fs.readFileSync(messagesPath, 'utf8');
    const messages = JSON.parse(raw);
    const candidates = [
      'homepage.checklistsHeading',
      'hero.title',
      'site.title',
    ];
    for (const keyPath of candidates) {
      const value = getByPath(messages, keyPath);
      if (typeof value === 'string' && value.trim()) {
        return { text: value.trim(), path: messagesPath, keyPath };
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

function run() {
  const failures = [];
  const warnings = [];
  const locales = Object.keys(LOCALES);
  const stats = {
    routeFilesChecked: 0,
    titleContentChecks: 0,
    bodyContentChecks: 0,
    homepageKeyTextChecks: 0,
    structuralChecks: 0,
    keystaticStructuralSkipped: 0,
  };

  if (!fs.existsSync(OUT_DIR)) {
    sectionStart('✅', 'Validate build — content, routes & HTML shape');
    detail(`Expected out/ at ${OUT_DIR}`);
    sectionEnd(false, ['Missing out/ — run pnpm buildstatic first']);
    process.exit(1);
  }

  sectionStart('✅', 'Validate build — content, routes & HTML shape');
  detail(`Output: ${path.relative(ROOT, OUT_DIR) || 'out'}`);

  // 1) Page inventory + dynamic checks for guides/pages per locale.
  for (const locale of locales) {
    const guides = getAllGuides(locale);
    const pages = getAllPages(locale);
    const collectionSpecs = [
      { collection: 'guides', items: guides },
      { collection: 'pages', items: pages },
    ];

    for (const spec of collectionSpecs) {
      for (const item of spec.items) {
        const routeSlug = item.frontmatter?.slug || item.slug;
        const htmlPath = routePath(locale, routeSlug);
        const descriptor = `${locale} ${spec.collection} "${routeSlug}"`;
        stats.routeFilesChecked += 1;
        if (!assertFile(htmlPath, descriptor, failures)) continue;

        const source = getSourceForLocale({ locale, collection: spec.collection, item });
        const { title, body, bodyProbe, bodyOrigin } = getVerificationStringsFromParsed(source.parsed);
        if (!title) {
          warnings.push(`${descriptor}: no title in ${path.relative(ROOT, source.source)}`);
        }

        if (title) {
          stats.titleContentChecks += 1;
          assertContains(
            htmlPath,
            title,
            `${descriptor} title check (${source.isTranslated ? 'translated' : 'fallback'})`,
            failures,
            {
              sourcePath: source.source,
              sourceLine: source.parsed?.frontmatter?.title || null,
            }
          );
        }
        if (body) {
          stats.bodyContentChecks += 1;
          checkBodyContains(
            htmlPath,
            bodyProbe || body,
            `${descriptor} body check (${source.isTranslated ? 'translated' : 'fallback'}, ${bodyOrigin})`,
            failures,
            warnings,
            {
              sourcePath: source.source,
              sourceLine: body,
            }
          );
        } else {
          warnings.push(`${descriptor}: no body string extracted from ${path.relative(ROOT, source.source)}`);
        }

        if (locale === DEFAULT_LOCALE) {
          const rootPath = rootEnglishRoutePath(routeSlug);
          stats.routeFilesChecked += 1;
          assertFile(rootPath, `root English copy "${routeSlug}"`, failures);
        }
      }
    }
  }

  // 2) Index pages must exist for each locale.
  for (const locale of locales) {
    for (const route of INDEX_ROUTES) {
      const label = route || '(home)';
      const filePath = routePath(locale, route);
      stats.routeFilesChecked += 1;
      assertFile(filePath, `${locale} index route ${label}`, failures);
    }
  }

  // 2b) Homepage key text checks (non-MDX guardrail).
  for (const locale of locales) {
    const homePath = routePath(locale, '');
    if (!exists(homePath)) continue;
    const expectedText = getHomepageExpectedText(locale);
    if (!expectedText) {
      warnings.push(`${locale} homepage key-text check: could not read messages/${locale}.json key`);
      continue;
    }
    assertContains(
      homePath,
      expectedText.text,
      `${locale} homepage key-text check`,
      failures,
      {
        sourcePath: expectedText.path,
        sourceLine: `${expectedText.keyPath}: ${expectedText.text}`,
      }
    );
    stats.homepageKeyTextChecks += 1;
  }

  // 3) News dynamic verification for each locale.
  for (const locale of locales) {
    const newsIndexPath = routePath(locale, 'news');
    const hasNews = exists(newsIndexPath);

    const newsItems = getAllNewsItems(locale);
    for (const item of newsItems) {
      if (!hasNews) break;
      const source = getSourceForLocale({ locale, collection: 'news', item });
      const { title, body, bodyProbe, bodyOrigin } = getVerificationStringsFromParsed(source.parsed);
      if (title) {
        stats.titleContentChecks += 1;
        assertContains(
          newsIndexPath,
          title,
          `${locale} news "${item.slug}" title check (${source.isTranslated ? 'translated' : 'fallback'})`,
          failures,
          {
            sourcePath: source.source,
            sourceLine: source.parsed?.frontmatter?.title || null,
          }
        );
      }
      if (body) {
        stats.bodyContentChecks += 1;
        checkBodyContains(
          newsIndexPath,
          bodyProbe || body,
          `${locale} news "${item.slug}" body check (${source.isTranslated ? 'translated' : 'fallback'}, ${bodyOrigin})`,
          failures,
          warnings,
          {
            sourcePath: source.source,
            sourceLine: body,
          }
        );
      }
    }

    // Changelog index is validated as a route/file in the index checks above.
  }

  // 4) Structural sanity and count checks.
  const htmlFiles = collectAllHtmlFiles(OUT_DIR);
  if (htmlFiles.length < CONTENT_FLOOR) {
    failures.push(`HTML count too low: found ${htmlFiles.length}, expected at least ${CONTENT_FLOOR}`);
  }

  const localeCounts = {};
  for (const locale of locales) {
    const localePrefix = `${path.sep}${locale}${path.sep}`;
    localeCounts[locale] = htmlFiles.filter((f) => f.includes(localePrefix)).length;
    if (localeCounts[locale] === 0) {
      failures.push(`No HTML files found for locale "${locale}"`);
    }
  }

  for (const filePath of htmlFiles) {
    const html = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(ROOT, filePath);
    if (html.length < 1024) {
      failures.push(`HTML too small (<1KB): ${rel}`);
      continue;
    }
    if (filePath.includes(`${path.sep}keystatic${path.sep}`)) {
      // Keystatic admin UI does not follow the public site layout conventions.
      stats.keystaticStructuralSkipped += 1;
      continue;
    }
    stats.structuralChecks += 1;
    const normalized = html.toLowerCase();
    if (!normalized.includes('<main')) {
      failures.push(`Missing <main> in ${rel}`);
    }
    if (!normalized.includes('<nav')) {
      failures.push(`Missing <nav> in ${rel}`);
    }
  }

  subsection('📊', 'Scan summary');
  detail(`HTML files: ${htmlFiles.length}`);
  detail(`Route / file checks: ${stats.routeFilesChecked}`);
  detail(`Title comparisons: ${stats.titleContentChecks}`);
  detail(`Body comparisons: ${stats.bodyContentChecks}`);
  detail(`Homepage key-text checks: ${stats.homepageKeyTextChecks}`);
  detail(`Structural (<main> / <nav>): ${stats.structuralChecks}`);
  if (stats.keystaticStructuralSkipped > 0) {
    detail(`Keystatic pages skipped (structural): ${stats.keystaticStructuralSkipped}`);
  }
  for (const locale of locales) {
    detail(`Locale ${locale}: ${localeCounts[locale] || 0} HTML file(s)`);
  }

  if (warnings.length > 0) {
    subsection('⚠️', `Warnings (${warnings.length})`);
    warnings.slice(0, 20).forEach((w, index) => {
      if (typeof w === 'string') {
        console.log(chalk.yellow(`     ${index + 1}. ${w}`));
        return;
      }
      if (w?.type === 'content-miss') {
        printContentMiss(w, 'warning', index + 1);
        return;
      }
      console.log(chalk.yellow(`     ${index + 1}. ${String(w)}`));
    });
    if (warnings.length > 20) {
      detail(`… and ${warnings.length - 20} more warning(s)`);
    }
  }

  if (failures.length > 0) {
    subsection('🚫', `Failures (${failures.length})`);
    failures.forEach((f, index) => {
      if (typeof f === 'string') {
        console.error(chalk.red(`     ${index + 1}. ${f}`));
        return;
      }
      if (f?.type === 'content-miss') {
        printContentMiss(f, 'failure', index + 1);
        return;
      }
      console.error(chalk.red(`     ${index + 1}. ${String(f)}`));
    });
    sectionEnd(false, [
      `Validation failed: ${failures.length} issue(s)`,
      `HTML files scanned: ${htmlFiles.length}`,
    ]);
    process.exit(1);
  }

  const okLines = [
    `HTML files: ${htmlFiles.length}`,
    `Routes & content checks completed`,
  ];
  if (warnings.length > 0) {
    okLines.push(`Warnings: ${warnings.length} (non-fatal — see above)`);
  }
  sectionEnd(true, okLines);
}

function printContentMiss(issue, level, index) {
  const isFailure = level === 'failure';
  const headerColor = isFailure ? chalk.red.bold : chalk.yellow.bold;
  const keyColor = isFailure ? chalk.red : chalk.yellow;
  const valueColor = chalk.white;

  const expected = issue.expectedLoose || '';
  const actual = issue.actualLoose || '';
  const diffAt = firstDiffIndex(expected, actual);
  const marker = diffAt >= 0 ? `${' '.repeat(diffAt)}^` : '';

  const prefix = issue.severity ? `${issue.severity}: ` : '';
  console.log(headerColor(`     ${index}. ${prefix}${issue.description}`));
  console.log(`        ${keyColor('out:      ')}${valueColor(issue.outputFile || '-')}`);
  console.log(`        ${keyColor('source:   ')}${valueColor(issue.sourceFile || '-')}`);
  if (issue.sourceLine) {
    console.log(`        ${keyColor('src line:')}${valueColor(` ${issue.sourceLine}`)}`);
  }
  console.log(`        ${keyColor('expected:')}${chalk.cyan(` ${expected || '-'}`)}`);
  console.log(`        ${keyColor('actual:  ')}${chalk.magenta(` ${actual || '(no nearby text found)'}`)}`);
  if (marker) {
    console.log(`        ${keyColor('diff:    ')}${chalk.green(marker)}`);
  }
  console.log(`        ${keyColor('needle:   ')}${chalk.gray(issue.expectedNormalized || '-')}`);
}

run();
