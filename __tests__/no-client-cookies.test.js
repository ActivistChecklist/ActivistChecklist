/**
 * The privacy page promises that the site stores no cookies on the reader's
 * device. Client code for the public site must never touch document.cookie.
 * Upstream shadcn components (the sidebar, for one) write cookies by default,
 * so re-adding or updating one can quietly bring a cookie back.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { routing } from '../i18n/routing';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_DIRS = ['components', 'contexts', 'hooks', 'lib'];
const SOURCE_FILE = /\.(js|jsx|ts|tsx|mjs)$/;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

describe('public site client code', () => {
  it('never reads or writes document.cookie', () => {
    const offenders = CLIENT_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .filter((file) => readFileSync(file, 'utf8').includes('document.cookie'))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  // next-intl writes a NEXT_LOCALE cookie from the browser on a language
  // switch unless this is false. The scan above cannot see library code.
  it('keeps the next-intl locale cookie turned off', () => {
    expect(routing.localeCookie).toBe(false);
  });
});
