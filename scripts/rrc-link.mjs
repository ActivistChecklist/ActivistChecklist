#!/usr/bin/env node
/**
 * Toggle between the published `@activistchecklist/react-review-comments` and a
 * local checkout (default: ../react-review-comments). Useful when iterating on
 * the library against this app.
 *
 *   pnpm rrc:link       # symlink node_modules/<pkg> -> local checkout
 *   pnpm rrc:unlink     # restore the version pinned in package.json
 *   pnpm rrc:status     # show whether we're linked, and to where
 *
 * Override the checkout location with RRC_LOCAL_PATH=/abs/or/relative/path.
 */
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = '@activistchecklist/react-review-comments';
const HOST_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCAL = resolve(HOST_ROOT, '..', 'react-review-comments');

function localPath() {
  const override = process.env.RRC_LOCAL_PATH;
  if (!override) return DEFAULT_LOCAL;
  return isAbsolute(override) ? override : resolve(HOST_ROOT, override);
}

function nodeModulesPath() {
  return resolve(HOST_ROOT, 'node_modules', ...PKG.split('/'));
}

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: HOST_ROOT, ...opts });
}

/**
 * Returns the real path of the installed package only when it's linked to a
 * checkout *outside* the host's node_modules. Normal pnpm installs also
 * symlink the package, but into `node_modules/.pnpm/...`, which we ignore.
 */
function currentLinkTarget() {
  const p = nodeModulesPath();
  if (!existsSync(p)) return null;
  try {
    const stat = lstatSync(p);
    if (!stat.isSymbolicLink()) return null;
    const real = realpathSync(p);
    const hostModules = resolve(HOST_ROOT, 'node_modules');
    if (real.startsWith(hostModules + '/') || real === hostModules) {
      return null;
    }
    return real;
  } catch {
    return null;
  }
}

function status() {
  const target = currentLinkTarget();
  if (target) {
    console.log(`linked → ${target}`);
  } else {
    console.log(`not linked (using published version from package.json)`);
  }
}

function link() {
  const src = localPath();
  if (!existsSync(src)) {
    console.error(`Local checkout not found at ${src}`);
    console.error(`Clone it there, or set RRC_LOCAL_PATH=/path/to/react-review-comments`);
    process.exit(1);
  }
  if (!existsSync(resolve(src, 'package.json'))) {
    console.error(`${src} does not look like a package (no package.json)`);
    process.exit(1);
  }

  const existing = currentLinkTarget();
  if (existing === src) {
    console.log(`Already linked to ${src} — nothing to do.`);
    return;
  }

  run(`pnpm link "${src}"`);

  // The library has react/react-dom in devDependencies; if pnpm hoists them
  // into the linked checkout, Next will load two copies and throw "Invalid hook
  // call". Remove them so the host's copies are used through the symlink.
  for (const dep of ['react', 'react-dom']) {
    const nested = resolve(src, 'node_modules', dep);
    if (existsSync(nested)) {
      console.log(`Removing nested ${dep} to prevent duplicate-React errors: ${nested}`);
      rmSync(nested, { recursive: true, force: true });
    }
  }

  console.log('');
  status();
  console.log('');
  console.log('Restart `pnpm dev` to pick up the local checkout.');
}

function unlink() {
  const existing = currentLinkTarget();
  if (!existing) {
    console.log('Not currently linked — nothing to do.');
    return;
  }
  // `pnpm unlink <pkg>` removes the symlink; the subsequent install restores
  // the version range from package.json.
  run(`pnpm unlink ${PKG}`);
  run(`pnpm install`);
  console.log('');
  status();
}

const cmd = process.argv[2];
switch (cmd) {
  case 'link':
    link();
    break;
  case 'unlink':
    unlink();
    break;
  case 'status':
    status();
    break;
  default:
    console.error(`Usage: node scripts/rrc-link.mjs <link|unlink|status>`);
    process.exit(2);
}
