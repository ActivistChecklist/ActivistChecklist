/**
 * A short content hash for each designed PDF in each language, added as ?v=
 * to links to the PDF and its preview image (components/PdfDownload.jsx) so a
 * stale cached copy is never shown after the poster changes.
 *
 * next.config.js computes this when the build starts, before
 * scripts/build-designed-pdfs.mjs has rendered anything, so it hashes the
 * inputs rather than the output: the English and translated text, plus every
 * file that shapes the design. A change to any shared file moves every
 * version, which costs nothing worse than one extra download.
 *
 * CommonJS because next.config.js is.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SHARED_INPUTS = ['config/pdfs.mjs', 'lib/pdf', 'scripts/build-designed-pdfs.mjs'];

function listFiles(target) {
  if (!fs.existsSync(target)) return [];
  if (!fs.statSync(target).isDirectory()) return [target];
  return fs
    .readdirSync(target)
    .sort()
    .flatMap((name) => listFiles(path.join(target, name)));
}

function hashFiles(files, root) {
  const h = crypto.createHash('sha256');
  for (const file of files) {
    h.update(path.relative(root, file));
    h.update('\0');
    h.update(fs.readFileSync(file));
  }
  return h.digest('hex');
}

/**
 * @param root repository root
 * @returns { 'en/police-at-the-door': 'a1b2c3d4e5', ... } for every
 *          content/<locale>/pdf/<slug>.json that has an English source
 */
function designedPdfVersions(root) {
  const shared = hashFiles(
    SHARED_INPUTS.flatMap((p) => listFiles(path.join(root, p))),
    root,
  );
  const contentDir = path.join(root, 'content');
  const versions = {};
  if (!fs.existsSync(contentDir)) return versions;
  for (const locale of fs.readdirSync(contentDir).sort()) {
    const dir = path.join(contentDir, locale, 'pdf');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.json')) continue;
      const english = path.join(contentDir, 'en', 'pdf', name);
      if (!fs.existsSync(english)) continue;
      const slug = name.slice(0, -'.json'.length);
      const h = crypto.createHash('sha256');
      h.update(shared);
      h.update(fs.readFileSync(english));
      h.update(fs.readFileSync(path.join(dir, name)));
      versions[`${locale}/${slug}`] = h.digest('hex').slice(0, 10);
    }
  }
  return versions;
}

module.exports = { designedPdfVersions };
