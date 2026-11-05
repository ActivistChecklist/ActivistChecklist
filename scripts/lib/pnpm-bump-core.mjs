// Pure logic for scripts/pnpm-bump.mjs: pick the newest pnpm release on the
// major we pin that has been out long enough, and check that `corepack use`
// changed only what a pnpm bump should. No I/O here so the decisions are
// testable; the CLI does the fetching, the corepack run and the writing.
//
// The pin lives in two files that must move together:
//   package.json    packageManager, "pnpm@X.Y.Z+sha512.<hex>". CI
//                   (pnpm/action-setup), Railway and corepack all read it.
//   pnpm-lock.yaml  its first YAML document, where pnpm records itself under
//                   packageManagerDependencies. The second document is the
//                   dependency lockfile, which a bump must leave alone.

// Release-age wait in days, the same as the npm cooldown in
// .github/dependabot.yml (semver-minor-days, semver-patch-days).
// __tests__/pnpm-bump-core.test.js fails if the two drift apart.
export const COOLDOWN_DAYS = { minor: 3, patch: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;
const EXACT = /^(\d+)\.(\d+)\.(\d+)$/;
const PACKAGE_MANAGER = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha512\.([0-9a-f]{128}))?$/;

/** [major, minor, patch] for a stable release ("12.16.1"), else null. Prereleases are null. */
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

/** { version, hash } from a packageManager value. Throws unless it pins an exact pnpm release. */
export function parsePackageManager(field) {
  const m = PACKAGE_MANAGER.exec(String(field ?? ''));
  if (!m) {
    throw new Error(
      `package.json packageManager must pin an exact pnpm release like pnpm@12.16.1, got "${field}"`,
    );
  }
  return { version: m[1], hash: m[2] ?? null };
}

/**
 * Which pnpm release to move to from `current`, given the output of
 * `npm view pnpm dist-tags time versions --json`.
 *
 * Candidates are stable releases on the same major, newer than `current` and
 * no newer than the `latest-<major>` dist-tag. pnpm publishes each release to
 * `next-<major>` first and promotes it to `latest-<major>` later, so anything
 * above that tag is still on trial. A candidate is due once it has been on npm
 * for COOLDOWN_DAYS.minor days when it changes the minor, or COOLDOWN_DAYS.patch
 * when only the patch moves. A release with no publish time is never due.
 *
 * Returns { target, waiting }. `target` is the newest due candidate as
 * { version, date, skipped }, where `skipped` lists the candidates below it that
 * the bump also covers, or null when none is due. `waiting` lists the newer
 * candidates still inside their wait, newest first, with the time each one is
 * due (`dueAt`). Both empty means `current` is already the newest.
 */
export function pickUpgrade(registry, current, now) {
  const cur = parseVersion(current);
  if (!cur) throw new Error(`expected an exact pnpm version like 12.16.1, got "${current}"`);
  const tag = `latest-${cur[0]}`;
  const ceiling = parseVersion(registry['dist-tags']?.[tag]);
  if (!ceiling) throw new Error(`npm has no ${tag} dist-tag for pnpm`);

  const candidates = [];
  for (const version of registry.versions) {
    const v = parseVersion(version);
    if (!v || v[0] !== cur[0] || compare(v, cur) <= 0 || compare(v, ceiling) > 0) continue;
    const date = registry.time?.[version] ?? null;
    const published = Date.parse(date);
    const days = v[1] === cur[1] ? COOLDOWN_DAYS.patch : COOLDOWN_DAYS.minor;
    const dueAt = Number.isNaN(published) ? null : published + days * DAY_MS;
    candidates.push({ v, version, date, dueAt });
  }
  candidates.sort((a, b) => compare(b.v, a.v));

  const at = candidates.findIndex((c) => c.dueAt !== null && c.dueAt <= now);
  const waiting = (at === -1 ? candidates : candidates.slice(0, at)).map((c) => ({
    version: c.version,
    date: c.date,
    dueAt: c.dueAt === null ? null : new Date(c.dueAt).toISOString(),
  }));
  if (at === -1) return { target: null, waiting };
  return {
    target: {
      version: candidates[at].version,
      date: candidates[at].date,
      skipped: candidates.slice(at + 1).map((c) => c.version),
    },
    waiting,
  };
}

/** Hex form of an npm "sha512-<base64>" integrity, which is what corepack puts after "+sha512.". */
export function integrityToHex(integrity) {
  const m = /^sha512-([A-Za-z0-9+/]{86}==)$/.exec(String(integrity ?? '').trim());
  if (!m) throw new Error(`expected a sha512 integrity from npm, got "${integrity}"`);
  return Buffer.from(m[1], 'base64').toString('hex');
}

/** pnpm-lock.yaml split into pnpm's own document and the dependency lockfile after it. */
function lockfileDocuments(text) {
  const docs = text.split(/^---\n/m);
  if (docs.length !== 3 || docs[0] !== '') {
    throw new Error(
      "expected pnpm-lock.yaml to hold two YAML documents: pnpm's own entry, then the dependency lockfile",
    );
  }
  return { own: docs[1], deps: docs[2] };
}

/**
 * Throws unless `after` is `before` with pnpm moved to `version` and nothing
 * else: packageManager is "pnpm@<version>+sha512.<hex>" with npm's own
 * `integrity` for that release, no other package.json field changed, the
 * lockfile records the same version for pnpm, and the dependency lockfile is
 * byte for byte the same. `before` and `after` are { packageJson, lockfile } as
 * text.
 */
export function checkBump({ before, after, version, integrity }) {
  const problems = [];

  const expected = `pnpm@${version}+sha512.${integrityToHex(integrity)}`;
  const oldPkg = JSON.parse(before.packageJson);
  const newPkg = JSON.parse(after.packageJson);
  if (newPkg.packageManager !== expected) {
    problems.push(
      `package.json packageManager is "${newPkg.packageManager}", but npm says it should be "${expected}"`,
    );
  }
  const rest = (pkg) => JSON.stringify({ ...pkg, packageManager: null });
  if (rest(oldPkg) !== rest(newPkg)) problems.push('package.json changed beyond packageManager');

  const oldLock = lockfileDocuments(before.lockfile);
  const newLock = lockfileDocuments(after.lockfile);
  const pin =
    /packageManagerDependencies:\n\s+pnpm:\n\s+specifier: (\S+)\n\s+version: (\S+)\n/.exec(
      newLock.own,
    );
  if (!pin || pin[1] !== version || pin[2] !== version) {
    problems.push(
      `pnpm-lock.yaml packageManagerDependencies does not record pnpm ${version}` +
        (pin ? ` (specifier ${pin[1]}, version ${pin[2]})` : ''),
    );
  }
  if (oldLock.deps !== newLock.deps) {
    problems.push(
      "pnpm-lock.yaml changed beyond pnpm's own entry: the dependency lockfile (its second YAML document) moved too",
    );
  }

  if (problems.length) {
    throw new Error(`Not a clean pnpm bump to ${version}:\n- ${problems.join('\n- ')}`);
  }
}
