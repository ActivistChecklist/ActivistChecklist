import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

import { escapeHtml, localizeContent, renderInline } from '../lib/pdf/content.mjs';
import { LOCALES } from '../lib/i18n-config.mjs';
import {
  designedPdfPath,
  designedPreviewPath,
  pdfDownloadOrder,
  withVersion,
} from '../lib/pdf/catalog.mjs';
import { PDFS } from '../config/pdfs.mjs';

const { designedPdfVersions } = createRequire(import.meta.url)('../lib/pdf/versions.cjs');

const ROOT = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

describe('renderInline', () => {
  it('turns <b> pairs into <strong> and escapes everything else', () => {
    expect(renderInline('<b>Do NOT open the door</b> unless “they” & co')).toBe(
      '<strong>Do NOT open the door</strong> unless “they” &amp; co',
    );
  });

  it('never lets other markup through', () => {
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderInline('<b onclick="x()">hi</b>')).toBe(
      '&lt;b onclick=&quot;x()&quot;&gt;hi&lt;/b&gt;',
    );
    expect(renderInline('<b><img src=x></b>')).toBe('<strong>&lt;img src=x&gt;</strong>');
  });

  it('prints an unclosed or stray tag as typed', () => {
    expect(renderInline('<b>bold')).toBe('&lt;b&gt;bold');
    expect(renderInline('not bold</b>')).toBe('not bold&lt;/b&gt;');
  });

  it('pairs each <b> with the nearest </b>', () => {
    expect(renderInline('<b>a</b> and <b>b</b>')).toBe('<strong>a</strong> and <strong>b</strong>');
  });
});

describe('localizeContent', () => {
  const source = {
    title: 'Police at the door',
    steps: { one: { heading: 'One', bullets: { a: 'A', b: 'B' } } },
  };

  it('uses the translation where it has the string', () => {
    const { content, missing } = localizeContent(source, {
      title: 'La policía en la puerta',
      steps: { one: { heading: 'Uno', bullets: { a: 'Á', b: 'Bé' } } },
    });
    expect(content.title).toBe('La policía en la puerta');
    expect(content.steps.one.bullets).toEqual({ a: 'Á', b: 'Bé' });
    expect(missing).toEqual([]);
  });

  it('falls back to English for missing or blank strings and lists them', () => {
    const { content, missing } = localizeContent(source, {
      title: '  ',
      steps: { one: { bullets: { a: 'Á' } } },
    });
    expect(content.title).toBe('Police at the door');
    expect(content.steps.one.heading).toBe('One');
    expect(content.steps.one.bullets).toEqual({ a: 'Á', b: 'B' });
    expect(missing).toEqual(['title', 'steps.one.heading', 'steps.one.bullets.b']);
  });

  it('keeps the English structure and order, ignoring keys English does not have', () => {
    const { content } = localizeContent(source, {
      extra: 'x',
      steps: { one: { bullets: { b: 'Bé', a: 'Á', c: 'C' } } },
    });
    expect(Object.keys(content)).toEqual(['title', 'steps']);
    expect(Object.keys(content.steps.one.bullets)).toEqual(['a', 'b']);
  });

  it('falls back when the translation has the wrong type', () => {
    const { content } = localizeContent(source, {
      title: { nested: 'x' },
      steps: { one: 'not an object' },
    });
    expect(content.title).toBe('Police at the door');
    expect(content.steps.one.heading).toBe('One');
  });

  it('does not read inherited properties from the translation', () => {
    const translation = JSON.parse('{"__proto__": {"title": "polluted"}}');
    expect(localizeContent(source, translation).content.title).toBe('Police at the door');
    expect({}.title).toBeUndefined();
  });

  it('rejects English content that is not text or groups of keys', () => {
    expect(() => localizeContent({ list: ['a'] }, {})).toThrow(/list/);
  });
});

// Every configured PDF, rendered to HTML in every language it publishes, the
// way scripts/build-designed-pdfs.mjs does before handing it to Chromium.
describe('config/pdfs.mjs', () => {
  it('has at least one PDF', () => {
    expect(Object.keys(PDFS).length).toBeGreaterThan(0);
  });

  for (const [slug, config] of Object.entries(PDFS)) {
    describe(slug, async () => {
      const layout = await import(`../lib/pdf/layouts/${config.layout}.mjs`);
      const source = readJson(path.join(ROOT, 'content', 'en', 'pdf', `${slug}.json`));

      it('links to a page and prints its address', () => {
        expect(config.pagePath).toMatch(/^\/[a-z0-9-/]+\/$/);
        expect(config.printedUrl).toMatch(/^ActivistChecklist\.org\//);
      });

      // The download button links every listed language, so each needs a file.
      it('publishes English and only site locales that have a translation file', () => {
        expect(config.locales).toContain('en');
        for (const locale of config.locales) {
          expect(Object.keys(LOCALES)).toContain(locale);
          expect(fs.existsSync(path.join(ROOT, 'content', locale, 'pdf', `${slug}.json`))).toBe(
            true,
          );
        }
      });

      for (const locale of config.locales) {
        it(`renders in ${locale}`, () => {
          const translation = readJson(path.join(ROOT, 'content', locale, 'pdf', `${slug}.json`));
          const { content } = localizeContent(source, translation);
          const html = layout.renderPosterHtml({
            content,
            config,
            lang: LOCALES[locale].intlLocale,
            href: `https://activistchecklist.org${config.pagePath}`,
            paper: { width: 816, height: 1056 },
            fontCss: '',
          });
          expect(html).toContain(`<title>${escapeHtml(content.title)}</title>`);
          expect(html).not.toMatch(/&lt;\/?b&gt;/);
        });
      }
    });
  }
});

describe('pdfDownloadOrder', () => {
  const pdfs = {
    poster: { locales: ['en', 'es', 'fr'] },
    spanishOnly: { locales: ['es'] },
  };

  it('offers every language on English pages, English first', () => {
    expect(pdfDownloadOrder('poster', 'en', pdfs)).toEqual(['en', 'es', 'fr']);
  });

  it("offers only the page's own language on a translated page that has one", () => {
    expect(pdfDownloadOrder('poster', 'es', pdfs)).toEqual(['es']);
  });

  it('offers only English on a translated page the PDF is not published in', () => {
    expect(pdfDownloadOrder('poster', 'ja', pdfs)).toEqual(['en']);
  });

  it('falls back to the first listed language when there is no English', () => {
    expect(pdfDownloadOrder('spanishOnly', 'fr', pdfs)).toEqual(['es']);
    expect(pdfDownloadOrder('spanishOnly', 'en', pdfs)).toEqual(['es']);
  });

  it('offers nothing for an unknown PDF', () => {
    expect(pdfDownloadOrder('missing', 'en', pdfs)).toEqual([]);
    expect(pdfDownloadOrder('constructor', 'en', pdfs)).toEqual([]);
  });
});

describe('designed PDF URLs', () => {
  it('serves each language at its own path, the preview beside the PDF', () => {
    expect(designedPdfPath('es', 'poster')).toBe('/files/pdf/es/poster.pdf');
    expect(designedPreviewPath('es', 'poster')).toBe('/files/pdf/es/poster.webp');
  });

  it('adds the content version as ?v=, and nothing when there is none', () => {
    expect(withVersion('/files/pdf/en/poster.pdf', 'a1b2c3d4e5')).toBe(
      '/files/pdf/en/poster.pdf?v=a1b2c3d4e5',
    );
    expect(withVersion('/files/pdf/en/poster.pdf', undefined)).toBe('/files/pdf/en/poster.pdf');
  });
});

describe('designedPdfVersions', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'designed-pdf-versions-'));
  const write = (root, file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const fixture = () => {
    const root = tmp();
    write(root, 'config/pdfs.mjs', 'export const PDFS = {};');
    write(root, 'lib/pdf/layouts/a.mjs', 'layout');
    write(root, 'content/en/pdf/poster.json', '{"title":"Poster"}');
    write(root, 'content/es/pdf/poster.json', '{"title":"Cartel"}');
    write(root, 'content/es/pdf/orphan.json', '{"title":"Huérfano"}');
    return root;
  };

  it('has a short version for each translation with an English source', () => {
    const root = fixture();
    try {
      const versions = designedPdfVersions(root);
      expect(Object.keys(versions).sort()).toEqual(['en/poster', 'es/poster']);
      for (const v of Object.values(versions)) expect(v).toMatch(/^[0-9a-f]{10}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('changes a language when its text, the English text or the design changes', () => {
    const root = fixture();
    try {
      const before = designedPdfVersions(root);
      write(root, 'content/es/pdf/poster.json', '{"title":"Póster"}');
      const afterSpanish = designedPdfVersions(root);
      expect(afterSpanish['es/poster']).not.toBe(before['es/poster']);
      expect(afterSpanish['en/poster']).toBe(before['en/poster']);

      write(root, 'content/en/pdf/poster.json', '{"title":"The poster"}');
      const afterEnglish = designedPdfVersions(root);
      expect(afterEnglish['es/poster']).not.toBe(afterSpanish['es/poster']);

      write(root, 'lib/pdf/layouts/a.mjs', 'new layout');
      const afterDesign = designedPdfVersions(root);
      expect(afterDesign['en/poster']).not.toBe(afterEnglish['en/poster']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('covers every PDF the site publishes', () => {
    const versions = designedPdfVersions(ROOT);
    for (const [slug, { locales }] of Object.entries(PDFS)) {
      for (const locale of locales) expect(versions[`${locale}/${slug}`]).toBeDefined();
    }
  });
});

describe('steps-with-contacts layout', async () => {
  const layout = await import('../lib/pdf/layouts/steps-with-contacts.mjs');
  const base = {
    title: 'T',
    intro: 'I',
    fillIn: { g: { heading: 'H', fields: { a: 'A' } } },
    moreInfo: 'M',
    steps: { s: { heading: 'S', numbered: { a: 'one', b: 'two' } } },
  };
  const render = (content) =>
    layout.renderPosterHtml({
      content,
      config: { printedUrl: 'ActivistChecklist.org/police' },
      lang: 'en-US',
      href: 'https://activistchecklist.org/police/',
      paper: { width: 816, height: 1056 },
      fontCss: '',
    });

  it('renders each list kind with its own markup', () => {
    const html = render({
      ...base,
      steps: { s: { heading: 'S', intro: 'Say:', phrases: { a: 'x' }, bullets: { b: 'y' } } },
    });
    expect(html).toMatch(/<p class="step-intro">Say:<\/p><ul class="phrases"><li><svg/);
    expect(html).toContain('<ul class="bullets"><li>y</li></ul>');
  });

  it('names the step and the allowed kinds when a step has an unknown part', () => {
    expect(() => render({ ...base, steps: { s: { heading: 'S', table: {} } } })).toThrow(
      /steps\.s\.table: a step can hold heading, intro, bullets, numbered, phrases/,
    );
  });

  it('escapes translated text, including the title in <title>', () => {
    const html = render({ ...base, title: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('<title>&lt;img src=x onerror=alert(1)&gt;</title>');
  });

  it('scales a page drawn for Letter to fit A4', () => {
    const html = layout.renderPosterHtml({
      content: base,
      config: { printedUrl: 'x' },
      lang: 'fr-FR',
      href: 'https://activistchecklist.org/fr/police/',
      paper: { width: 793.7, height: 1122.52 },
      fontCss: '',
    });
    const args = JSON.parse(html.match(/\)\((\{.*\})\);/)[1]);
    expect(args.scale.factor).toBeCloseTo(793.7 / 816, 5);
    expect(args.scale.x).toBeCloseTo(0, 5);
    expect(args.scale.y).toBeGreaterThan(40);
  });
});
