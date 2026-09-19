#!/usr/bin/env node
/**
 * Replaces the block between ### BEGIN GENERATED REDIRECTS ### and ### END ### in an
 * .htaccess file with Redirect lines derived from lib/redirects.config.cjs.
 *
 * Usage: node scripts/inject-htaccess-redirects.cjs <path-to-.htaccess>
 *
 * Called from scripts/postbuild.sh after copying public/.htaccess → out/.htaccess
 * for BUILD_MODE=static (FTP / Apache static deploy).
 */

const fs = require('fs');
const path = require('path');

const { REDIRECTS } = require(path.join(__dirname, '..', 'lib', 'redirects.config.cjs'));

const BEGIN =
  '### BEGIN GENERATED REDIRECTS (from lib/redirects.config.cjs) ###';
const END = '### END GENERATED REDIRECTS ###';

function apacheRedirectLines() {
  return REDIRECTS.map(({ source, destination, permanent = true }) => {
    const code = permanent ? '301' : '302';
    return `Redirect ${code} ${source} ${destination}`;
  });
}

function inject(filePath) {
  const resolved = path.resolve(filePath);
  let content = fs.readFileSync(resolved, 'utf8');

  const inner = apacheRedirectLines().join('\n');
  const block = `${BEGIN}\n${inner}\n${END}`;

  const escapedBegin = BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, 'm');

  if (!re.test(content)) {
    console.error(
      `inject-htaccess-redirects: markers not found in ${resolved}\n` +
        `Expected lines: ${BEGIN} ... ${END}`
    );
    process.exit(1);
  }

  content = content.replace(re, block);
  fs.writeFileSync(resolved, content, 'utf8');
  console.log(
    `inject-htaccess-redirects: wrote ${REDIRECTS.length} redirect(s) → ${resolved}`
  );
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/inject-htaccess-redirects.cjs <path-to-.htaccess>');
  process.exit(1);
}

inject(target);
