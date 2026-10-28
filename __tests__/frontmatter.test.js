import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { parseFrontmatter, stringifyFrontmatter } from '@/lib/frontmatter.cjs';

afterEach(() => {
  delete globalThis.__frontmatterRan;
});

describe('parseFrontmatter', () => {
  it('parses YAML front matter and returns the body', () => {
    const { data, content } = parseFrontmatter('---\ntitle: Hello\ntags: [a, b]\n---\nBody text\n');
    expect(data).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(content).toBe('Body text\n');
  });

  it('accepts an explicit yaml or yml language tag', () => {
    expect(parseFrontmatter('---yaml\ntitle: A\n---\n').data).toEqual({ title: 'A' });
    expect(parseFrontmatter('---yml\ntitle: B\n---\n').data).toEqual({ title: 'B' });
  });

  it('handles a byte order mark and files without front matter', () => {
    expect(parseFrontmatter('﻿---\ntitle: C\n---\nx').data).toEqual({ title: 'C' });
    expect(parseFrontmatter('# Just a heading\n')).toEqual({
      data: {},
      content: '# Just a heading\n',
    });
    expect(parseFrontmatter('')).toEqual({ data: {}, content: '' });
  });

  it.each(['js', 'javascript', 'JS', 'JavaScript', ' js ', 'coffee'])(
    'refuses "---%s" front matter without running it',
    (lang) => {
      const raw = `---${lang}\n{ title: (globalThis.__frontmatterRan = true, 'x') }\n---\nbody`;
      expect(() => parseFrontmatter(raw)).toThrow(/not allowed/);
      expect(globalThis.__frontmatterRan).toBeUndefined();
    },
  );

  it('refuses other non-YAML languages', () => {
    expect(() => parseFrontmatter('---json\n{"title": "x"}\n---\n')).toThrow(/not allowed/);
  });

  it('stringifyFrontmatter never parses its content argument', () => {
    const body = '---js\n{ t: (globalThis.__frontmatterRan = true, 1) }\n---\nbody';
    expect(stringifyFrontmatter(body, { a: 1 })).toBe(`---\na: 1\n---\n${body}\n`);
    expect(globalThis.__frontmatterRan).toBeUndefined();
  });

  it('round-trips through stringifyFrontmatter', () => {
    const text = stringifyFrontmatter('Body\n', { title: 'T' });
    expect(parseFrontmatter(text)).toEqual({ data: { title: 'T' }, content: 'Body\n' });
  });
});

describe('gray-matter usage', () => {
  it('is only loaded by lib/frontmatter.cjs', () => {
    let out = '';
    try {
      out = execFileSync(
        'git',
        // Any quoted module specifier, so require, import, import(), createRequire and
        // subpaths like gray-matter/lib/engines are all caught.
        [
          'grep',
          '--untracked',
          '-lE',
          `['"\`]gray-matter(/[^'"\`]*)?['"\`]`,
          '--',
          ':!package.json',
          ':!pnpm-lock.yaml',
        ],
        { encoding: 'utf8' },
      );
    } catch (err) {
      // git grep exits 1 when nothing matches.
      if (err.status !== 1) throw err;
    }
    const files = out.split('\n').filter(Boolean);
    expect(files).toEqual(['lib/frontmatter.cjs']);
  });
});
