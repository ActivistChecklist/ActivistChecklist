import {
  REPLACEMENTS,
  applyReplacements,
  scriptSyntaxError,
  assertStillParses,
} from '../scripts/lib/check-build-core.mjs';

const rewrite = (s) => applyReplacements(s).content;

/**
 * Regression: these replacements are blind text substitution over minified JS.
 * A pattern that consumes a string terminator produces a bundle that no longer
 * parses. That shipped to production once (Next 16 moved docs URLs to the end
 * of template literals) and took all site JS down with
 * "Uncaught SyntaxError: missing ) after argument list".
 */
describe('applyReplacements does not corrupt JavaScript', () => {
  // Verbatim shapes taken from the Next 16 bundle that broke.
  const REAL_WORLD = [
    'throw Object.defineProperty(Error(`x. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action`),"__NEXT_ERROR_CODE",{value:"E715"});',
    'function f(){let r=`Learn more: https://nextjs.org/docs/messages/instant-unrendered-segment`;return Object.defineProperty(Error("x"),"C",{value:"E1286"})}',
    'throw Object.defineProperty(Error(`y. Learn more: https://nextjs.org/docs/messages/instant-link-prefetch-partial`),"__NEXT_ERROR_CODE",{value:"E1435"});',
    'let s=`Read more: https://nextjs.org/docs/messages/${o?"href-interpolation-failed":"incompatible-href-as"}`;',
  ];

  test.each(REAL_WORLD)('output still parses: %s', (src) => {
    expect(scriptSyntaxError(src)).toBeNull(); // input is valid to begin with
    expect(scriptSyntaxError(rewrite(src))).toBeNull();
  });

  test('a docs URL ending a template literal keeps its closing backtick', () => {
    const out = rewrite('const m=`see https://nextjs.org/docs/messages/some-slug`;');
    expect(out).toContain('`;');
    expect(scriptSyntaxError(out)).toBeNull();
  });

  test('does not swallow code following the URL', () => {
    const out = rewrite('function f(){let r=`x https://nextjs.org/docs/messages/instant-unrendered-segment`;return 1}');
    expect(out).toContain('`;return 1}');
    expect(scriptSyntaxError(out)).toBeNull();
  });

  test('leaves a runtime interpolation intact', () => {
    const out = rewrite('`https://nextjs.org/docs/messages/${a?"b":"c"}`');
    expect(out).toContain('${a?"b":"c"}');
    expect(out).not.toContain('nextjs.org');
  });

  test.each(['"', "'", '`', ')', '<', '>', ' ', ';', ','])(
    'stops cleanly before delimiter %j',
    (delim) => {
      const out = rewrite(`x=https://nextjs.org/docs/messages/slug${delim}y`);
      expect(out).toBe(`x=BLOCKEDNEXTJSDOCS${delim}y`);
    }
  );
});

describe('applyReplacements still does its job', () => {
  test('replaces a plain docs URL', () => {
    expect(rewrite('see https://nextjs.org/docs/messages/foo-bar now')).toBe(
      'see BLOCKEDNEXTJSDOCS now'
    );
  });

  test('strips the bare domain when the slug is interpolated', () => {
    expect(rewrite('https://nextjs.org/docs/messages/${x}')).not.toContain('nextjs.org');
  });

  test.each([
    ['storyblok.com', 'BLOCKEDSTORYBLOK'],
    ['cdn.jsdelivr.net', 'BLOCKEDJSDELIVR'],
    ['fonts.googleapis.com', 'BLOCKEDGOOGLE'],
  ])('still blocks %s', (host, blocked) => {
    const out = rewrite(`a ${host} b`);
    expect(out).toContain(blocked);
    expect(out).not.toContain(host);
  });

  test('rewrites storyblok CDN images to local paths', () => {
    expect(rewrite('https://a.storyblok.com/f/123/abc-def/ghi-jkl/pic.png')).toBe(
      '/images/pic.png'
    );
  });

  test('reports what it replaced', () => {
    const { counts } = applyReplacements('https://nextjs.org/docs/messages/a and fonts.googleapis.com');
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  test('leaves unrelated content untouched', () => {
    const src = 'const x = 1; // nothing to see';
    expect(rewrite(src)).toBe(src);
  });

  test('every rule has a global flag, or replace() would only fix the first hit', () => {
    for (const { pattern } of REPLACEMENTS) expect(pattern.flags).toContain('g');
  });
});

/**
 * The build exited 0 while shipping a broken bundle, so nothing caught the
 * corruption until traffic dropped. assertStillParses is that missing gate.
 */
describe('assertStillParses', () => {
  const GOOD = 'var a=(1);';
  const BROKEN = 'var a=(1;';

  test('throws when a replacement breaks a .js file', () => {
    expect(() => assertStillParses('out/x.js', GOOD, BROKEN)).toThrow(/corrupted out\/x\.js/);
  });

  test('names the fix in the error so it is not just disabled', () => {
    expect(() => assertStillParses('out/x.js', GOOD, BROKEN)).toThrow(/REPLACEMENTS/);
  });

  test('passes when the output still parses', () => {
    expect(() => assertStillParses('out/x.js', GOOD, 'var a=(2);')).not.toThrow();
  });

  test('ignores files that were already unparseable (not our doing)', () => {
    expect(() => assertStillParses('out/x.js', BROKEN, 'var a=(2;')).not.toThrow();
  });

  test('ignores non-.js files, where HTML/CSS is not valid script', () => {
    expect(() => assertStillParses('out/x.html', '<p>a</p>', '<p>b</p>')).not.toThrow();
  });

  test('no-ops when nothing changed', () => {
    expect(() => assertStillParses('out/x.js', BROKEN, BROKEN)).not.toThrow();
  });
});
