#!/usr/bin/env node
/**
 * Build-time SEO audit. Walks `content/en/{guides,pages}/*.mdx` and warns when
 * pages are missing the SEO frontmatter we expect after the SEO improvement pass.
 *
 * Non-blocking by default — prints findings and exits 0. Pass `--strict`
 * (or set SEO_AUDIT_STRICT=1) to fail the build on any warning.
 *
 * Spanish content (`content/es/`) is excluded — Crowdin fills those fields.
 *
 * Pure logic functions are exported for vitest.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const TOP_GUIDE_SLUGS = [
  'signal',
  'essentials',
  'travel',
  'ice',
  'protest',
  'doxxing',
  'secondary',
  'emergency',
];
const FAQ_GUIDE_SLUGS = ['signal', 'essentials', 'travel'];

const DESC_MIN = 70;
const DESC_MAX = 160;
const TITLE_MAX = 60;
const CAPSULE_WORDS_MIN = 30;
const CAPSULE_WORDS_MAX = 90;

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'en');

// ─── Pure rule evaluators (exported for tests) ─────────────────

function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

function hasFaqBlock(body) {
  if (!body) return false;
  return /<FAQ(\s|>)/.test(body);
}

function evaluatePage({ kind, slug, frontmatter, body }) {
  const findings = [];
  const fm = frontmatter || {};
  const isTopGuide = kind === 'guide' && TOP_GUIDE_SLUGS.includes(slug);
  const isFaqGuide = kind === 'guide' && FAQ_GUIDE_SLUGS.includes(slug);

  // seoDescription required for all guides + pages
  const desc = fm.seoDescription;
  if (!desc || !String(desc).trim()) {
    findings.push({
      severity: 'warn',
      message: 'seoDescription missing',
    });
  } else {
    const len = String(desc).trim().length;
    if (len < DESC_MIN) {
      findings.push({
        severity: 'warn',
        message: `seoDescription is ${len} chars; aim for ${DESC_MIN}–${DESC_MAX}`,
      });
    } else if (len > DESC_MAX) {
      findings.push({
        severity: 'warn',
        message: `seoDescription is ${len} chars; hard ceiling is ${DESC_MAX}`,
      });
    }
  }

  // Dates required
  if (!fm.firstPublished) {
    findings.push({ severity: 'warn', message: 'firstPublished missing' });
  }
  if (!fm.lastUpdated) {
    findings.push({ severity: 'warn', message: 'lastUpdated missing' });
  }

  // seoTitle warning for top guides only
  if (isTopGuide) {
    if (!fm.seoTitle || !String(fm.seoTitle).trim()) {
      findings.push({
        severity: 'warn',
        message: 'top-8 guide is missing seoTitle',
      });
    } else if (String(fm.seoTitle).length > TITLE_MAX) {
      findings.push({
        severity: 'warn',
        message: `seoTitle is ${String(fm.seoTitle).length} chars; aim under ${TITLE_MAX}`,
      });
    }
  } else if (fm.seoTitle && String(fm.seoTitle).length > TITLE_MAX) {
    findings.push({
      severity: 'warn',
      message: `seoTitle is ${String(fm.seoTitle).length} chars; aim under ${TITLE_MAX}`,
    });
  }

  // answerCapsule warning for top guides
  if (isTopGuide) {
    if (!fm.answerCapsule || !String(fm.answerCapsule).trim()) {
      findings.push({
        severity: 'warn',
        message: 'top-8 guide is missing answerCapsule',
      });
    } else {
      const wc = wordCount(fm.answerCapsule);
      if (wc < CAPSULE_WORDS_MIN || wc > CAPSULE_WORDS_MAX) {
        findings.push({
          severity: 'warn',
          message: `answerCapsule is ${wc} words; aim ${CAPSULE_WORDS_MIN}–${CAPSULE_WORDS_MAX}`,
        });
      }
    }
  }

  // FAQ block warning for top-3 guides
  if (isFaqGuide && !hasFaqBlock(body)) {
    findings.push({
      severity: 'warn',
      message: 'top-3 guide is missing a <FAQ> block in the body',
    });
  }

  return findings;
}

/**
 * Detect duplicate seoDescription values across pages. Identical descriptions
 * dilute SERP differentiation and are usually a copy-paste mistake.
 */
function findDuplicateDescriptions(entries) {
  const byDesc = new Map();
  for (const e of entries) {
    const d = (e.frontmatter?.seoDescription || '').trim();
    if (!d) continue;
    if (!byDesc.has(d)) byDesc.set(d, []);
    byDesc.get(d).push(`${e.kind === 'guide' ? 'guides' : 'pages'}/${e.slug}.mdx`);
  }
  const dups = [];
  for (const [desc, files] of byDesc.entries()) {
    if (files.length > 1) {
      dups.push({ desc, files });
    }
  }
  return dups;
}

// ─── Filesystem layer ──────────────────────────────────────────

function listMdxDir(kind, dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dirPath, f), 'utf8');
      const { data, content } = matter(raw);
      return {
        kind,
        slug: f.replace(/\.mdx$/, ''),
        frontmatter: data,
        body: content,
      };
    });
}

function loadAllEntries() {
  return [
    ...listMdxDir('guide', path.join(CONTENT_ROOT, 'guides')),
    ...listMdxDir('page', path.join(CONTENT_ROOT, 'pages')),
  ];
}

// ─── Report ────────────────────────────────────────────────────

function formatReport({ clean, problems, duplicates }) {
  const lines = [];
  lines.push('');
  lines.push('SEO audit');
  lines.push('─────────');
  if (!problems.length && !duplicates.length) {
    lines.push(`✓  ${clean} pages clean — no issues`);
    return lines.join('\n');
  }
  const totalIssues =
    problems.reduce((acc, p) => acc + p.findings.length, 0) + duplicates.length;
  lines.push(`✓  ${clean} pages clean`);
  lines.push(`⚠  ${totalIssues} issues across ${problems.length} pages`);
  lines.push('');
  for (const p of problems) {
    lines.push(`  content/en/${p.kind === 'guide' ? 'guides' : 'pages'}/${p.slug}.mdx`);
    for (const f of p.findings) {
      lines.push(`    – ${f.message}`);
    }
    lines.push('');
  }
  for (const d of duplicates) {
    lines.push(`  Duplicate seoDescription used by:`);
    for (const f of d.files) lines.push(`    – ${f}`);
    lines.push(`    "${d.desc.slice(0, 100)}${d.desc.length > 100 ? '…' : ''}"`);
    lines.push('');
  }
  lines.push('Run with --strict to fail the build on warnings.');
  return lines.join('\n');
}

// ─── Entry point ───────────────────────────────────────────────

function runAudit() {
  const entries = loadAllEntries();
  const problems = [];
  let clean = 0;
  for (const e of entries) {
    const findings = evaluatePage(e);
    if (findings.length) {
      problems.push({ kind: e.kind, slug: e.slug, findings });
    } else {
      clean += 1;
    }
  }
  const duplicates = findDuplicateDescriptions(entries);
  return { clean, problems, duplicates };
}

function main() {
  const strict = process.argv.includes('--strict') || process.env.SEO_AUDIT_STRICT === '1';
  const report = runAudit();
  const text = formatReport(report);
  if (report.problems.length || report.duplicates.length) {
    // eslint-disable-next-line no-console
    console.warn(text);
    if (strict) process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.log(text);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluatePage,
  findDuplicateDescriptions,
  formatReport,
  hasFaqBlock,
  wordCount,
  runAudit,
  TOP_GUIDE_SLUGS,
  FAQ_GUIDE_SLUGS,
};
