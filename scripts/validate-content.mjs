#!/usr/bin/env node

/**
 * MDX Content Security Validator
 *
 * Scans all MDX files in content/ for security violations:
 *   Layer 1: Regex scan for suspicious patterns
 *   Layer 2: AST validation via MDX compilation with security plugins
 *
 * Usage:
 *   node scripts/validate-content.mjs              # validate all content
 *   node scripts/validate-content.mjs path/to/file  # validate specific file(s)
 *
 * Exit code 0 = all clear, 1 = violations found, 2 = script error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { serialize } from 'next-mdx-remote/serialize';
import matter from 'gray-matter';
import remarkGfm from 'remark-gfm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');

// ─── Suspicious patterns (Layer 1: regex scan) ──────────────────

const SUSPICIOUS_PATTERNS = [
  { pattern: /^\s*import\s+/gm, label: 'import statement' },
  { pattern: /^\s*export\s+/gm, label: 'export statement' },
  { pattern: /\brequire\s*\(/g, label: 'require() call' },
  { pattern: /\beval\s*\(/g, label: 'eval() call' },
  { pattern: /\bFunction\s*\(/g, label: 'Function() constructor' },
  { pattern: /\bprocess\.(env|exit|argv|cwd|stdout|stderr)\b/g, label: 'process access' },
  { pattern: /dangerouslySetInnerHTML/g, label: 'dangerouslySetInnerHTML' },
  { pattern: /javascript\s*:/gi, label: 'javascript: URL' },
  { pattern: /\bon[A-Z][a-zA-Z]*\s*=/g, label: 'event handler attribute' },
  { pattern: /<script[\s>]/gi, label: '<script> tag' },
  { pattern: /<iframe[\s>]/gi, label: '<iframe> tag' },
  { pattern: /<object[\s>]/gi, label: '<object> tag' },
  { pattern: /<embed[\s>]/gi, label: '<embed> tag' },
  { pattern: /<form[\s>]/gi, label: '<form> tag' },
  { pattern: /data:text\/html/gi, label: 'data:text/html URL' },
];

// ─── Allowed component names ─────────────────────────────────────

const ALLOWED_COMPONENTS = new Set([
  'Alert', 'HowTo', 'Button', 'ImageEmbed', 'VideoEmbed',
  'RiskLevel', 'Table', 'RelatedGuides', 'RelatedGuide', 'Section', 'ChecklistItem',
  'ChecklistItemGroup',
  'CopyButton', 'Badge', 'InlineChecklist',
  'StyledSpan', 'SimpleImage', 'TranslationStats',
]);

const ALLOWED_HTML_ELEMENTS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr',
  'u', 'ul', 'del', 'ins', 'mark', 'small', 'details', 'summary',
  'figure', 'figcaption', 'video', 'source',
]);

// ─── Remark plugins for AST validation ───────────────────────────

function remarkStripEsm() {
  return (tree) => {
    const esmNodes = tree.children.filter(n => n.type === 'mdxjsEsm');
    if (esmNodes.length > 0) {
      throw new Error(
        `Found ${esmNodes.length} ESM import/export statement(s). ` +
        `MDX content must not contain import or export statements.`
      );
    }
  };
}

function remarkRejectExpressions() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
        // Allow simple prop expressions like guides={["a", "b"]}
        // But reject complex JS expressions
        const value = node.value || '';
        if (value.includes('(') || value.includes('import') || value.includes('require')) {
          throw new Error(
            `Potentially dangerous JS expression found: {${value.slice(0, 80)}}`
          );
        }
      }
      if (node.children) node.children.forEach(visit);
    };
    visit(tree);
  };
}

function remarkValidateComponents() {
  return (tree) => {
    const violations = [];
    const visit = (node) => {
      if (
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement'
      ) {
        const name = node.name;
        if (name && !ALLOWED_COMPONENTS.has(name) && !ALLOWED_HTML_ELEMENTS.has(name)) {
          violations.push(`Unregistered component: <${name}>`);
        }
        if (node.attributes) {
          for (const attr of node.attributes) {
            if (attr.name && /^on[A-Z]/.test(attr.name)) {
              violations.push(`Event handler "${attr.name}" on <${name}>`);
            }
          }
        }
      }
      if (node.children) node.children.forEach(visit);
    };
    visit(tree);
    if (violations.length > 0) {
      throw new Error(violations.join('; '));
    }
  };
}

// ─── File discovery ──────────────────────────────────────────────

function findMdxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdxFiles(fullPath));
    } else if (entry.name.endsWith('.mdx')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Validation ──────────────────────────────────────────────────

async function validateFile(filePath) {
  const errors = [];
  const relativePath = path.relative(ROOT, filePath);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    errors.push({ file: relativePath, error: `Cannot read file: ${e.message}` });
    return errors;
  }

  // Layer 1: Regex scan
  const { content } = matter(raw);
  for (const { pattern, label } of SUSPICIOUS_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) {
      // Find line numbers
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[i])) {
          errors.push({
            file: relativePath,
            line: i + 1,
            error: `Suspicious pattern: ${label}`,
            context: lines[i].trim().slice(0, 100),
          });
        }
      }
    }
  }

  // Layer 2: AST validation via MDX compilation
  try {
    await serialize(content, {
      mdxOptions: {
        remarkPlugins: [
          remarkGfm,
          remarkStripEsm,
          remarkRejectExpressions,
          remarkValidateComponents,
        ],
        rehypePlugins: [],
      },
    });
  } catch (e) {
    errors.push({
      file: relativePath,
      error: `MDX compilation/validation error: ${e.message}`,
    });
  }

  return errors;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let files;

  if (args.length > 0) {
    files = args.map(f => path.resolve(f));
  } else {
    files = findMdxFiles(CONTENT_DIR);
  }

  if (files.length === 0) {
    console.log('No MDX files found to validate.');
    process.exit(0);
  }

  console.log(`Validating ${files.length} MDX file(s)...\n`);

  let totalErrors = 0;
  for (const file of files) {
    const errors = await validateFile(file);
    if (errors.length > 0) {
      totalErrors += errors.length;
      for (const err of errors) {
        const loc = err.line ? `:${err.line}` : '';
        console.error(`  ✗ ${err.file}${loc}`);
        console.error(`    ${err.error}`);
        if (err.context) {
          console.error(`    > ${err.context}`);
        }
      }
    }
  }

  console.log();
  if (totalErrors === 0) {
    console.log(`✓ All ${files.length} file(s) passed validation.`);
    process.exit(0);
  } else {
    console.error(`✗ ${totalErrors} violation(s) found across ${files.length} file(s).`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(2);
});
