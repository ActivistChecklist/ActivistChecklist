import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import {
  sectionStart,
  sectionEnd,
  detail,
  subsection,
} from './lib/build-cli.mjs';

const OUTPUT_DIR = 'out';

// Define all find/replace patterns
const REPLACEMENTS = [
  // Replace storyblock CDN images with local images
  {
    pattern: /@?https?:\/\/[a-z-]+\.storyblok\.com\/f\/\d+\/[\w-]+\/[\w-]+\//g,
    replacement: '/images/'
  },
  // Make sure that none of their scripts call their API ever
  {
    pattern: /storyblok\.com/g,
    replacement: 'BLOCKEDSTORYBLOK'
  },
  // Comes from Stroyblok
  {
    pattern: /cdn\.jsdelivr\.net/g,
    replacement: 'BLOCKEDJSDELIVR'
  },
  // Google fonts
  {
    pattern: /fonts\.googleapis\.com/g,
    replacement: 'BLOCKEDGOOGLE'
  },
  // Next.js documentation URLs (error messages in bundled code)
  {
    pattern: /https?:\/\/nextjs\.org\/docs\/messages\/[^\s"'<>()]+/g,
    replacement: 'BLOCKEDNEXTJSDOCS'
  }
];

const FORBIDDEN_STRINGS = [
  '://localhost',
  'localhost:300',
  '://127.0.0.1',
  'notion.so',
  'notion.site',
  'storyblok.io',
];

// Exceptions: allow specific forbidden strings in bundled third-party code.
// Keystatic uses "http://localhost" as a base URL for the URL constructor (not a real request)
// and registers 127.0.0.1 as a GitHub OAuth callback for local development.
const FORBIDDEN_STRING_EXCEPTIONS = [
  { string: '://localhost', filePattern: '_next/static/chunks/' },
  { string: 'localhost:300', filePattern: '_next/static/chunks/' },
  { string: '://127.0.0.1', filePattern: '_next/static/chunks/' },
];
const CONTEXT_CHARS = 150; // Number of characters to show before and after match

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store all findings
const findings = [];

// Store replacement stats
const replacementStats = new Map();

function getContext(content, matchIndex, matchLength) {
  const start = Math.max(0, matchIndex - CONTEXT_CHARS);
  const end = Math.min(content.length, matchIndex + matchLength + CONTEXT_CHARS);

  let context = content.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < content.length) context = context + '...';

  return context;
}

function applyReplacements(content) {
  let newContent = content;
  for (const { pattern, replacement } of REPLACEMENTS) {
    const matches = content.match(pattern) || [];
    const count = matches.length;
    if (count > 0) {
      const key = pattern.toString();
      replacementStats.set(key, (replacementStats.get(key) || 0) + count);
    }
    newContent = newContent.replace(pattern, replacement);
  }
  return newContent;
}

function readAndTransformFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const transformedContent = applyReplacements(content);

  if (transformedContent !== content) {
    fs.writeFileSync(filePath, transformedContent);
  }

  return transformedContent;
}

function isExcepted(forbiddenString, filePath) {
  return FORBIDDEN_STRING_EXCEPTIONS.some(
    ex => ex.string === forbiddenString && filePath.includes(ex.filePattern)
  );
}

function checkForbiddenStrings(content, filePath) {
  const fileFindings = [];

  for (const forbiddenString of FORBIDDEN_STRINGS) {
    if (isExcepted(forbiddenString, filePath)) continue;

    let index = content.indexOf(forbiddenString);
    while (index !== -1) {
      const context = getContext(content, index, forbiddenString.length);
      fileFindings.push({
        file: filePath,
        string: forbiddenString,
        context
      });
      index = content.indexOf(forbiddenString, index + 1);
    }
  }

  return fileFindings;
}

function scanFile(filePath) {
  const content = readAndTransformFile(filePath);
  const fileFindings = checkForbiddenStrings(content, filePath);
  findings.push(...fileFindings);
}

function isTargetFile(file) {
  return file.endsWith('.html') || file.endsWith('.js');
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && isTargetFile(file)) {
      scanFile(fullPath);
    }
  }
}

try {
  const outputDir = path.resolve(__dirname, '..', OUTPUT_DIR);

  if (!fs.existsSync(outputDir)) {
    sectionStart('🔒', 'Check build — scrub output & scan');
    detail(`No out/ at ${outputDir}`);
    detail('Skipping (normal when you are not doing a static export)');
    sectionEnd(true, ['Skipped — no output directory']);
    process.exit(0);
  }

  sectionStart('🔒', 'Check build — scrub output & scan');
  detail(`Scanning ${outputDir} (HTML/JS for forbidden strings)`);
  scanDirectory(outputDir);

  subsection('🔄', 'Replacement statistics');
  if (replacementStats.size > 0) {
    REPLACEMENTS.forEach(({ pattern, replacement }) => {
      const count = replacementStats.get(pattern.toString()) || 0;
      if (count > 0) {
        detail(`${count}× ${String(pattern).slice(0, 48)}… → ${replacement}`);
      }
    });
  } else {
    detail('No pattern replacements applied');
  }

  const replacementTotal = [...replacementStats.values()].reduce((a, b) => a + b, 0);

  if (findings.length > 0) {
    subsection('🚫', 'Forbidden strings & blocked URLs');
    const groupedFindings = findings.reduce((acc, finding) => {
      if (!acc[finding.file]) {
        acc[finding.file] = [];
      }
      acc[finding.file].push(finding);
      return acc;
    }, {});

    Object.entries(groupedFindings).forEach(([file, fileFindings], fileIndex) => {
      console.error(`\n${chalk.yellow.bold(`  File ${fileIndex + 1}:`)} ${chalk.yellow(file)}`);
      fileFindings.forEach((finding, index) => {
        console.error(`     ${chalk.red(`${index + 1}. "${chalk.bold(finding.string)}"`)}`);
        console.error(`        ${chalk.gray(finding.context)}`);
      });
    });
  } else {
    subsection('🚫', 'Forbidden strings');
    detail('None found');
  }

  const summary = [
    replacementTotal > 0
      ? `Rewrites: ${replacementTotal} substitution(s) in output`
      : 'Rewrites: none',
    findings.length === 0
      ? 'Forbidden / policy: clean'
      : `Forbidden / policy: ${findings.length} issue(s)`,
  ];

  sectionEnd(findings.length === 0, summary);

  process.exit(findings.length > 0 ? 1 : 0);
} catch (error) {
  console.error(chalk.red.bold('Check build error:'), chalk.red(error.message));
  process.exit(1);
}
