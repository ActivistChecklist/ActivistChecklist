import { describe, it, expect } from 'vitest';
import {
  inlineMarkdownHrefs,
  isSafeHref,
  parseInlineMarkdown,
  termLinkSlug,
} from '@/lib/inline-markdown';

const text = (value) => ({ type: 'text', value });

describe('parseInlineMarkdown', () => {
  it('returns plain text unchanged', () => {
    expect(parseInlineMarkdown("It's on by default on Android.")).toEqual([
      text("It's on by default on Android."),
    ]);
  });

  it('parses bold and both italic styles', () => {
    expect(
      parseInlineMarkdown('A **warrant** needs a judge, a *subpoena* or _summons_ may not.'),
    ).toEqual([
      text('A '),
      { type: 'strong', children: [text('warrant')] },
      text(' needs a judge, a '),
      { type: 'em', children: [text('subpoena')] },
      text(' or '),
      { type: 'em', children: [text('summons')] },
      text(' may not.'),
    ]);
  });

  it('parses italics nested inside bold', () => {
    expect(parseInlineMarkdown('**not *always* true**')).toEqual([
      {
        type: 'strong',
        children: [text('not '), { type: 'em', children: [text('always')] }, text(' true')],
      },
    ]);
  });

  it('parses https and site-relative links, with formatting in the link text', () => {
    expect(
      parseInlineMarkdown('See [our **VPN** guide](/vpn/) or [EFF](https://eff.org).'),
    ).toEqual([
      text('See '),
      {
        type: 'link',
        href: '/vpn/',
        children: [text('our '), { type: 'strong', children: [text('VPN')] }, text(' guide')],
      },
      text(' or '),
      { type: 'link', href: 'https://eff.org', children: [text('EFF')] },
      text('.'),
    ]);
  });

  it('keeps one level of parentheses inside a url', () => {
    const [link] = parseInlineMarkdown(
      '[FOIA](https://en.wikipedia.org/wiki/FOIA_(United_States))',
    );
    expect(link.href).toBe('https://en.wikipedia.org/wiki/FOIA_(United_States)');
  });

  it('parses term links to another definition', () => {
    expect(parseInlineMarkdown('people trying to [dox *you*](term:doxxing)')).toEqual([
      text('people trying to '),
      {
        type: 'term',
        slug: 'doxxing',
        children: [text('dox '), { type: 'em', children: [text('you')] }],
      },
    ]);
  });

  it('keeps the text of a malformed term link', () => {
    expect(parseInlineMarkdown('[dox](term:) or [x](term:Bad Slug)')).toEqual([
      text('dox'),
      text(' or [x](term:Bad Slug)'),
    ]);
  });

  it('drops unsafe links but keeps their text', () => {
    for (const href of [
      'javascript:alert(1)',
      'http://example.com',
      '//evil.example',
      'mailto:a@b.c',
    ]) {
      expect(parseInlineMarkdown(`[click](${href}) here`)).toEqual([text('click'), text(' here')]);
    }
  });

  it('leaves raw HTML as plain text', () => {
    expect(parseInlineMarkdown('<img src=x onerror=alert(1)>')).toEqual([
      text('<img src=x onerror=alert(1)>'),
    ]);
  });

  it('does not treat underscores inside words or lone asterisks as italics', () => {
    expect(parseInlineMarkdown('snake_case_name and 5 * 3 = 15')).toEqual([
      text('snake_case_name and 5 * 3 = 15'),
    ]);
  });
});

describe('isSafeHref', () => {
  it('allows only https and site-relative paths', () => {
    expect(isSafeHref('https://ssd.eff.org/')).toBe(true);
    expect(isSafeHref('/doxxing/#people-search')).toBe(true);
    expect(isSafeHref('http://ssd.eff.org/')).toBe(false);
    expect(isSafeHref('//ssd.eff.org/')).toBe(false);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
  });
});

describe('inlineMarkdownHrefs', () => {
  it('lists every link url, including unsafe ones', () => {
    expect(inlineMarkdownHrefs('[a](/vpn/) **b [c](javascript:x)**')).toEqual([
      '/vpn/',
      'javascript:x',
    ]);
  });
});

describe('termLinkSlug', () => {
  it('returns the slug only for well-formed term links', () => {
    expect(termLinkSlug('term:data-broker')).toBe('data-broker');
    expect(termLinkSlug('term:')).toBe(null);
    expect(termLinkSlug('term:Data_Broker')).toBe(null);
    expect(termLinkSlug('/doxxing/')).toBe(null);
  });
});
