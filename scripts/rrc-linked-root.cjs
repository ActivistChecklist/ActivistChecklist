const path = require('path');
const fs = require('fs');

const PKG_PATH = ['node_modules', '@activistchecklist', 'react-review-comments'];

/** Longest shared directory prefix of two absolute paths. */
function commonAncestor(a, b) {
  const as = a.split(path.sep);
  const bs = b.split(path.sep);
  const out = [];
  for (let i = 0; i < Math.min(as.length, bs.length); i += 1) {
    if (as[i] !== bs[i]) break;
    out.push(as[i]);
  }
  return out.join(path.sep) || path.sep;
}

/**
 * When `@activistchecklist/react-review-comments` is `pnpm rrc:link`ed to a local
 * checkout, its realpath lives outside `projectRoot`. Turbopack refuses to resolve
 * a package whose real path is outside the project root and fails with "Module not
 * found", so the caller should widen the Turbopack / file-tracing root to the
 * returned common-ancestor dir.
 *
 * Returns null for a normal (registry) install or outside development, so
 * production builds keep their pinned `__dirname` root untouched.
 */
module.exports = function linkedReviewCommentsRoot(projectRoot) {
  if (process.env.NODE_ENV !== 'development') return null;
  try {
    const real = fs.realpathSync(path.join(projectRoot, ...PKG_PATH));
    if (real === projectRoot || real.startsWith(projectRoot + path.sep)) {
      return null; // symlink resolves inside node_modules — normal install
    }
    return commonAncestor(projectRoot, real);
  } catch {
    return null;
  }
};
