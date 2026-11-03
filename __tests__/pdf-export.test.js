import { describe, expect, it } from 'vitest';
import {
  assignEndnotes,
  normalizeHtmlForHash,
  pdfDownloadName,
  pdfPaperFormat,
  pdfPathFor,
  planPdfBuild,
  shortenUrlForPrint,
} from '../lib/pdf-export.mjs';

const PAGE = 'https://activistchecklist.org/essentials/';

describe('pdfPathFor / pdfDownloadName', () => {
  it('keeps the locale in the path for every locale', () => {
    expect(pdfPathFor('en', 'essentials')).toBe('/pdf/en/essentials.pdf');
    expect(pdfPathFor('es', 'essentials')).toBe('/pdf/es/essentials.pdf');
  });

  it('suffixes the download name only for non-default locales', () => {
    expect(pdfDownloadName('en', 'protest')).toBe('activist-checklist-protest.pdf');
    expect(pdfDownloadName('es', 'protest')).toBe('activist-checklist-protest-es.pdf');
  });
});

describe('pdfPaperFormat', () => {
  it('uses Letter where the locale region uses it', () => {
    expect(pdfPaperFormat('en')).toBe('Letter');
    expect(pdfPaperFormat('es')).toBe('Letter');
  });

  it('uses A4 elsewhere', () => {
    expect(pdfPaperFormat('fr')).toBe('A4');
    expect(pdfPaperFormat('it')).toBe('A4');
  });

  it('falls back to the default locale for unknown locales', () => {
    expect(pdfPaperFormat('xx')).toBe('Letter');
  });
});

describe('shortenUrlForPrint', () => {
  it('drops the protocol and www', () => {
    expect(shortenUrlForPrint('https://www.signal.org/', PAGE)).toBe('signal.org');
    expect(shortenUrlForPrint('https://proton.me/mail', PAGE)).toBe('proton.me/mail');
  });

  it('resolves relative site links against the page', () => {
    expect(shortenUrlForPrint('/party/', PAGE)).toBe('activistchecklist.org/party/');
  });

  it('prints nothing for in-page jumps', () => {
    expect(shortenUrlForPrint('#signal', PAGE)).toBeNull();
    expect(shortenUrlForPrint('/essentials/#signal', PAGE)).toBeNull();
  });

  it('keeps a fragment link to another page', () => {
    expect(shortenUrlForPrint('/signal/#backups', PAGE)).toBe('activistchecklist.org/signal/');
  });

  it('prints nothing for non-web links', () => {
    expect(shortenUrlForPrint('mailto:contact@activistchecklist.org', PAGE)).toBeNull();
    expect(shortenUrlForPrint('javascript:void(0)', PAGE)).toBeNull();
    expect(shortenUrlForPrint('', PAGE)).toBeNull();
  });

  it('unwraps web.archive.org links to the original site', () => {
    expect(
      shortenUrlForPrint('https://web.archive.org/web/0/https://www.404media.co/some-story/', PAGE),
    ).toBe('404media.co/some-story/');
  });

  it('unwraps archive links with no timestamp or a suffixed one', () => {
    expect(
      shortenUrlForPrint('https://web.archive.org/web/https://www.forbes.com/sites/x/', PAGE),
    ).toBe('forbes.com/sites/x/');
    expect(
      shortenUrlForPrint('https://web.archive.org/web/20230301id_/https://example.com/a', PAGE),
    ).toBe('example.com/a');
  });

  it('keeps the query string, which can be what identifies the page', () => {
    expect(shortenUrlForPrint('https://example.com/watch?v=abc', PAGE)).toBe(
      'example.com/watch?v=abc',
    );
  });

  it('truncates long URLs with an ellipsis', () => {
    const out = shortenUrlForPrint(`https://example.com/${'a'.repeat(200)}`, PAGE);
    expect(out).toHaveLength(60);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('normalizeHtmlForHash', () => {
  const page = (chunk, body) => `<!DOCTYPE html><html><head>
    <link rel="stylesheet" href="/_next/static/css/abc.css" data-precedence="next"/>
    <script src="/_next/static/chunks/${chunk}.js" async=""></script>
  </head><body>${body}<script>self.__next_f.push([1,"${chunk}"])</script>
  <link rel="preload" as="script" href="/_next/static/chunks/${chunk}.js"/></body></html>`;

  it('ignores per-build chunk names and inline payloads', () => {
    const a = normalizeHtmlForHash(page('main-111', '<main><p>Use Signal</p></main>'));
    const b = normalizeHtmlForHash(page('main-222', '<main><p>Use Signal</p></main>'));
    expect(a.body).toBe(b.body);
  });

  it('changes when the visible content changes', () => {
    const a = normalizeHtmlForHash(page('main-111', '<main><p>Use Signal</p></main>'));
    const b = normalizeHtmlForHash(page('main-111', '<main><p>Use Signal daily</p></main>'));
    expect(a.body).not.toBe(b.body);
  });

  it('reports stylesheets and local images so their bytes can be hashed', () => {
    const { assetPaths } = normalizeHtmlForHash(
      page(
        'x',
        '<img src="/images/b.png"/><img src="https://cdn.example.com/c.png"/><img src="//cdn.example.com/d.png"/>',
      ),
    );
    expect(assetPaths).toEqual(['/_next/static/css/abc.css', '/images/b.png']);
  });
});

describe('planPdfBuild', () => {
  const targets = [
    { key: 'en/essentials', hash: 'h1' },
    { key: 'en/protest', hash: 'h2' },
    { key: 'es/essentials', hash: 'h3' },
  ];

  it('reuses PDFs whose hash matches and whose file exists', () => {
    const manifest = { 'en/essentials': 'h1', 'en/protest': 'old', 'es/essentials': 'h3' };
    const has = (key) => key !== 'es/essentials';
    const { stale, fresh } = planPdfBuild(targets, manifest, has);
    expect(fresh.map((t) => t.key)).toEqual(['en/essentials']);
    // protest changed; es/essentials matches but its file was deleted
    expect(stale.map((t) => t.key)).toEqual(['en/protest', 'es/essentials']);
  });

  it('renders everything on an empty cache', () => {
    const { stale, fresh } = planPdfBuild(targets, {}, () => true);
    expect(stale).toHaveLength(3);
    expect(fresh).toHaveLength(0);
  });

  it('lists cached PDFs for guides that no longer exist', () => {
    const { orphaned } = planPdfBuild(
      targets,
      { 'en/essentials': 'h1', 'en/old-guide': 'x' },
      () => true,
    );
    expect(orphaned).toEqual(['en/old-guide']);
  });
});

describe('assignEndnotes', () => {
  it('numbers links in order and reuses a number for the same page', () => {
    const { refs, notes } = assignEndnotes(
      ['https://signal.org/', '/party/', 'https://signal.org/#download', '#faq'],
      PAGE,
    );
    expect(refs).toEqual([1, 2, 1, null]);
    expect(notes).toEqual([
      { href: 'https://signal.org/', text: 'signal.org' },
      { href: 'https://activistchecklist.org/party/', text: 'activistchecklist.org/party/' },
    ]);
  });

  it('gives endnotes more room than the inline print limit', () => {
    const long = `https://example.com/${'a'.repeat(80)}`;
    const { notes } = assignEndnotes([long], PAGE);
    expect(notes[0].text).toBe(`example.com/${'a'.repeat(80)}`);
  });

  it('skips links that need no endnote', () => {
    expect(assignEndnotes(['mailto:a@b.org', '#top'], PAGE)).toEqual({
      refs: [null, null],
      notes: [],
    });
  });
});
