import fs from 'node:fs';
import path from 'node:path';
import {
  checkChangedPaths,
  checkMessages,
  compareMarkup,
  diffMessages,
  newLinkHosts,
  parseRawDiff,
  translationPatterns,
  translationTarget,
} from '../scripts/lib/l10n-pr-check-core.mjs';

// The real config, so a crowdin.yml change that the checker cannot follow
// shows up here first.
const patterns = translationPatterns(
  fs.readFileSync(path.resolve(import.meta.dirname, '..', 'crowdin.yml'), 'utf8'),
);

const change = (p, extra = {}) => ({
  status: 'M',
  srcMode: '100644',
  dstMode: '100644',
  path: p,
  ...extra,
});

describe('translationPatterns / translationTarget', () => {
  it('accepts translated MDX and messages files and maps them to their English source', () => {
    expect(translationTarget('content/es/guides/signal.mdx', patterns)).toEqual({
      locale: 'es',
      sourcePath: 'content/en/guides/signal.mdx',
    });
    expect(translationTarget('content/fr/signal.mdx', patterns)?.sourcePath).toBe(
      'content/en/signal.mdx',
    );
    expect(translationTarget('messages/ar.json', patterns)).toEqual({
      locale: 'ar',
      sourcePath: 'messages/en.json',
    });
  });

  it('rejects the English sources themselves', () => {
    expect(translationTarget('content/en/guides/signal.mdx', patterns)).toBeNull();
    expect(translationTarget('messages/en.json', patterns)).toBeNull();
  });

  it('rejects everything Crowdin does not write', () => {
    for (const p of [
      '.github/workflows/pr-checks.yml',
      'crowdin.yml',
      'scripts/validate-content.mjs',
      'components/Markdown.js',
      'content/storyblok-id-map.json',
      'content/es/announcement/index.yaml',
      'content/es/guides/signal.md',
      'content/es/guides/signal.mdx.js',
      'content/esp/guides/signal.mdx',
      'messages/es/extra.json',
      'messages/es.json.bak',
    ]) {
      expect(translationTarget(p, patterns), p).toBeNull();
    }
  });

  it('fails loudly on a crowdin.yml placeholder it does not understand', () => {
    const yml = `files:\n  - source: /a/en/*.mdx\n    translation: /a/%locale%/%original_file_name%\n`;
    expect(() => translationPatterns(yml)).toThrow(/%locale%/);
  });

  it('fails on a crowdin.yml with no files', () => {
    expect(() => translationPatterns('project_id_env: X\n')).toThrow(/no `files`/);
  });
});

describe('checkChangedPaths', () => {
  it('passes a translation-only diff, including deleted translations', () => {
    const changes = [
      change('content/es/guides/signal.mdx'),
      change('messages/es.json'),
      change('content/fr/news/old.mdx', { status: 'D', dstMode: '000000' }),
    ];
    expect(checkChangedPaths(changes, patterns)).toEqual([]);
  });

  it('flags any file outside the translation paths', () => {
    const changes = [
      change('content/es/guides/signal.mdx'),
      change('.github/workflows/deploy-webhook.yml'),
    ];
    expect(checkChangedPaths(changes, patterns)).toEqual([
      {
        path: '.github/workflows/deploy-webhook.yml',
        reason: expect.stringMatching(/not a Crowdin/),
      },
    ]);
  });

  it('flags a translation path committed as a symlink or executable', () => {
    const violations = checkChangedPaths(
      [
        change('content/es/guides/a.mdx', { status: 'A', dstMode: '120000' }),
        change('content/es/guides/b.mdx', { dstMode: '100755' }),
      ],
      patterns,
    );
    expect(violations.map((v) => v.reason)).toEqual([
      'unexpected file mode 120000',
      'unexpected file mode 100755',
    ]);
  });
});

describe('parseRawDiff', () => {
  it('parses git diff --raw -z output, including paths with spaces', () => {
    const out =
      ':100644 100644 aaa bbb M\0content/es/a b.mdx\0' +
      ':000000 120000 000 ccc A\0messages/es.json\0';
    expect(parseRawDiff(out)).toEqual([
      { status: 'M', srcMode: '100644', dstMode: '100644', path: 'content/es/a b.mdx' },
      { status: 'A', srcMode: '000000', dstMode: '120000', path: 'messages/es.json' },
    ]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseRawDiff('')).toEqual([]);
  });
});

describe('compareMarkup', () => {
  const english = [
    '---',
    'title: Use Signal',
    '---',
    'Install [Signal](https://signal.org/).',
    '<Alert type="warning" title="Careful">Check settings.</Alert>',
  ].join('\n');

  it('passes a translation that keeps the same tags and translates attribute values', () => {
    const es = [
      '---',
      'title: Usa Signal',
      '---',
      'Instala [Signal](https://signal.org/).',
      '<Alert type="warning" title="Cuidado">Revisa la configuración.</Alert>',
    ].join('\n');
    expect(compareMarkup(english, es)).toEqual([]);
  });

  it('flags a raw HTML tag the English does not have', () => {
    const problems = compareMarkup(english, `${english}\n<img src=x onerror="alert(1)">`);
    expect(problems).toContain('tag <img[onerror,src]> is not in the English source');
    expect(problems).toContain('1 more event handler attribute (on...=) than the English source');
  });

  it('flags a new attribute on a tag the English does have', () => {
    const tr = english.replace('<Alert type', '<Alert style="display:none" type');
    expect(compareMarkup(english, tr)).toEqual([
      'tag <Alert[style,title,type]> is not in the English source',
    ]);
  });

  it('flags a javascript: link, including entity and whitespace obfuscation', () => {
    for (const link of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java&#115;cript:x',
      'java\tscript:x',
      'javascript&colon;x',
    ]) {
      expect(compareMarkup(english, `${english}\n[x](${link})`), link).toContain(
        '1 more javascript: URL than the English source',
      );
    }
  });

  it('flags other script-capable URL schemes', () => {
    expect(compareMarkup('', '[x](vbscript:msgbox)')).toEqual([
      '1 more vbscript: URL than the English source',
    ]);
    expect(compareMarkup('', '[x](data:text/html,hi)')).toEqual([
      '1 more data:text/html URL than the English source',
    ]);
  });

  it('does not flag a script URL or handler the English already has as often', () => {
    const en = 'Type `javascript:` in the bar. Avoid `onclick=` handlers.';
    const tr = 'Escribe `javascript:` en la barra. Evita los manejadores `onclick=`.';
    expect(compareMarkup(en, tr)).toEqual([]);
  });

  it('still catches an event handler hidden behind an unbalanced brace in the tag', () => {
    const problems = compareMarkup(
      '<Alert type="x">a</Alert>',
      '<Alert type="x" data={ onmouseover=alert(1)>a</Alert>',
    );
    expect(problems).toContain('1 more event handler attribute (on...=) than the English source');
  });

  it('treats tag names case-sensitively, like MDX does', () => {
    expect(compareMarkup('<Alert>x</Alert>', '<alert>x</alert>')).toEqual([
      'tag <alert[]> is not in the English source',
    ]);
  });
});

describe('checkMessages', () => {
  const en = {
    contact: { title: 'Contact', note: 'Read the <link>guide</link> first.' },
    footer: 'Made with care',
  };

  it('passes translations that keep the rich-text tags of each English string', () => {
    const es = {
      contact: { title: 'Contacto', note: 'Lee primero la <link>guía</link>.' },
      footer: 'Hecho con cariño',
    };
    expect(checkMessages(en, es)).toEqual([]);
  });

  it('compares per key, so a tag moved into another string is flagged', () => {
    const es = { contact: { title: 'Contacto <link>x</link>', note: 'Lee la guía.' }, footer: 'x' };
    expect(checkMessages(en, es)).toEqual([
      'contact.title: tag <link[]> is not in the English source',
    ]);
  });

  it('flags HTML and script URLs in a string', () => {
    const es = {
      contact: { title: '<img src=x onerror=alert(1)>', note: '' },
      footer: 'javascript:x',
    };
    const problems = checkMessages(en, es);
    expect(problems).toContain(
      'contact.title: tag <img[onerror,src]> is not in the English source',
    );
    expect(problems).toContain('footer: 1 more javascript: URL than the English source');
  });

  it('holds keys missing from English to plain text', () => {
    expect(checkMessages(en, { extra: 'just words' })).toEqual([]);
    expect(checkMessages(en, { extra: '<b>bold</b>' })).toEqual([
      'extra: tag <b[]> is not in the English source',
    ]);
  });
});

describe('diffMessages', () => {
  it('lists added, changed and removed keys', () => {
    const before = { a: 'uno', b: { c: 'dos' }, gone: 'x' };
    const after = { a: 'uno', b: { c: 'DOS' }, added: 'nuevo' };
    expect(diffMessages(before, after)).toEqual([
      { key: 'b.c', kind: 'changed', value: 'DOS' },
      { key: 'added', kind: 'added', value: 'nuevo' },
      { key: 'gone', kind: 'removed', value: 'x' },
    ]);
  });
});

describe('newLinkHosts', () => {
  it('reports hosts the translation links to that the English never does', () => {
    const en = 'See https://signal.org/download and <https://ssd.eff.org/>.';
    const tr = 'Mira https://signal.org/es/ y https://signa1.org/download y http://Evil.example/x.';
    expect(newLinkHosts(en, tr)).toEqual(['evil.example', 'signa1.org']);
  });
});
