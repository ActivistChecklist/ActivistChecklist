// Pure logic for scripts/node-bump.mjs: pick the newest Node release on the
// major we pin, and rewrite the three files that name it. No I/O here so the
// decisions are testable; the CLI does the fetching and writing.
//
// The pin lives in three places that must move together:
//   .nvmrc         - CI (setup-node), and the May First host via nvm
//   railpack.json  - Railway builds
//   package.json   - engines, the floor for the pinned major

const EXACT = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** [major, minor, patch] for an exact version ("22.23.4" or "v22.23.4"), else null. */
export function parseVersion(str) {
  const m = EXACT.exec(String(str ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Newest release in `releases` (nodejs.org/dist/index.json) on the same major as
 * `current`, if it is newer. `security` is true when ANY release after `current`
 * up to the target is flagged as a security release, since skipping straight
 * to the newest still has to pick up those fixes and the PR should say so.
 *
 * Returns null when already current. Throws when `current` is not an exact
 * version: a range like "22" would make the "newer" comparison meaningless.
 */
export function pickUpgrade(releases, current) {
  const cur = parseVersion(current);
  if (!cur) {
    throw new Error(`.nvmrc must pin an exact version like 22.23.4, got "${current}"`);
  }
  const newer = [];
  for (const r of releases) {
    const v = parseVersion(r.version);
    if (v && v[0] === cur[0] && compare(v, cur) > 0) newer.push({ v, r });
  }
  if (newer.length === 0) return null;
  newer.sort((a, b) => compare(b.v, a.v));
  return {
    version: newer[0].v.join('.'),
    date: newer[0].r.date,
    security: newer.some(({ r }) => r.security === true),
    skipped: newer.slice(1).map(({ v }) => v.join('.')),
  };
}

/** First non-blank, non-comment line of .nvmrc (same rule as scripts/lib/nvm-pnpm.sh). */
export function readNvmrc(text) {
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (line && !line.startsWith('#')) return line;
  }
  return '';
}

/**
 * Raise the caret term for `version`'s major in an engines range and leave the
 * other majors alone: "^22.23.4 || ^24.22.1" -> "^22.23.5 || ^24.22.1". Throws
 * when there is no such term, rather than guessing how to widen the range.
 */
export function bumpEnginesRange(range, version) {
  const major = parseVersion(version)[0];
  const term = new RegExp(`\\^${major}\\.\\d+\\.\\d+(?![\\d.])`);
  if (!term.test(range)) {
    throw new Error(`engines.node "${range}" has no ^${major}.x.y term to raise`);
  }
  return range.replace(term, `^${version}`);
}

/**
 * New contents for the three pin files, or a thrown error when they disagree
 * about the current version (someone edited one by hand) or cannot be rewritten
 * without reformatting. package.json is edited as text so its formatting and
 * key order survive untouched.
 */
export function applyBump({ nvmrc, railpack, packageJson }, version) {
  const current = readNvmrc(nvmrc);

  const rp = JSON.parse(railpack);
  if (rp?.packages?.node !== current) {
    throw new Error(`railpack.json pins node "${rp?.packages?.node}" but .nvmrc pins "${current}"`);
  }
  rp.packages.node = version;

  const range = JSON.parse(packageJson)?.engines?.node;
  if (typeof range !== 'string') throw new Error('package.json has no engines.node');
  const newRange = bumpEnginesRange(range, version);
  const needle = `"node": ${JSON.stringify(range)}`;
  if (packageJson.split(needle).length !== 2) {
    throw new Error(`expected exactly one ${needle} in package.json`);
  }
  const newPackageJson = packageJson.replace(needle, `"node": ${JSON.stringify(newRange)}`);
  if (JSON.parse(newPackageJson).engines.node !== newRange) {
    throw new Error('rewrote the wrong "node" key in package.json');
  }

  // Only the version line: a comment above it may mention the old version too.
  const lines = nvmrc.split('\n');
  const at = lines.findIndex((l) => l.trim() === current);
  lines[at] = lines[at].replace(current, version);

  return {
    nvmrc: lines.join('\n'),
    railpack: `${JSON.stringify(rp, null, 2)}\n`,
    packageJson: newPackageJson,
    engines: { from: range, to: newRange },
  };
}
