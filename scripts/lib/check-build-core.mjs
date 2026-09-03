/**
 * Pure logic for scripts/check-build.mjs, split out so it can be unit tested.
 * check-build.mjs itself runs on import and calls process.exit(), so tests
 * cannot import it directly.
 */
import vm from 'vm';

// Define all find/replace patterns
export const REPLACEMENTS = [
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
  // Next.js documentation URLs (error messages in bundled code).
  //
  // Match ONLY characters that can appear in a docs-message slug. Do not use a
  // negated class here: the previous /[^\s"'<>()]+/ did not exclude backticks,
  // and Next 16 emits these URLs at the END of template literals, e.g.
  //   `... Learn more: https://nextjs.org/docs/messages/instant-unrendered-segment`}return ...
  // so the match ran past the closing backtick and ate the following syntax,
  // producing "Uncaught SyntaxError: missing ) after argument list" in the
  // shipped bundle. An allow-list can never consume a delimiter.
  {
    pattern: /https?:\/\/nextjs\.org\/docs\/messages\/[a-zA-Z0-9._~\/-]+/g,
    replacement: 'BLOCKEDNEXTJSDOCS'
  },
  // Catch-all for docs URLs whose slug is interpolated at runtime, e.g.
  //   `Read more: https://nextjs.org/docs/messages/${cond ? "a" : "b"}`
  // The rule above deliberately stops at the `$`, so strip the bare domain too.
  // A fixed literal like this can never consume a delimiter.
  {
    pattern: /nextjs\.org/g,
    replacement: 'BLOCKEDNEXTJS'
  }
];

export function applyReplacements(content) {
  let newContent = content;
  const counts = new Map();
  for (const { pattern, replacement } of REPLACEMENTS) {
    const matches = content.match(pattern) || [];
    if (matches.length > 0) {
      const key = pattern.toString();
      counts.set(key, (counts.get(key) || 0) + matches.length);
    }
    newContent = newContent.replace(pattern, replacement);
  }
  return { content: newContent, counts };
}

/**
 * Can this string be parsed as a classic script? Returns null when it parses,
 * or the error message when it does not.
 */
export function scriptSyntaxError(code) {
  try {
    new vm.Script(code);
    return null;
  } catch (err) {
    return err.message;
  }
}

/**
 * Guard against this step corrupting the bundle.
 *
 * These replacements are blind text substitution over minified JS, so a
 * too-greedy pattern can eat a string terminator and produce a file that no
 * longer parses. That shipped once (see the backtick note on the nextjs.org
 * rule above) and the build still exited 0, so nothing caught it until the
 * live site lost all its JS.
 *
 * We only fail when WE broke it: a file that already failed to parse before
 * the replacements (e.g. an ES module, which vm.Script cannot take) is not
 * our doing and is left alone.
 */
export function assertStillParses(filePath, before, after) {
  if (!filePath.endsWith('.js') || before === after) return;
  if (scriptSyntaxError(before) !== null) return; // not parseable to begin with
  const err = scriptSyntaxError(after);
  if (err !== null) {
    throw new Error(
      `check-build corrupted ${filePath}: ${err}\n` +
      'A replacement pattern consumed more than it should have. Fix the ' +
      'pattern in REPLACEMENTS rather than disabling this check.'
    );
  }
}
