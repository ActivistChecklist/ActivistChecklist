import { describe, it, expect } from 'vitest';
import { markdownToSafeHtml } from '../lib/markdown-html';

const html = (md, opts) => markdownToSafeHtml(md, opts).trim();

describe('markdownToSafeHtml: hostile input', () => {
  it('drops raw <img onerror> and keeps the surrounding text', () => {
    expect(html('Hi <img src=x onerror=alert(1)> there')).toBe('<p>Hi  there</p>');
  });

  it('drops raw HTML even when it is the whole block', () => {
    const out = html('<div onclick="alert(1)">x</div>\n\n<script>alert(1)</script>');
    expect(out).not.toMatch(/onclick|<script|<div|alert/);
  });

  it('removes javascript: hrefs from markdown links but keeps the link text', () => {
    expect(html('[x](javascript:alert(1))')).toBe('<p><a>x</a></p>');
  });

  it('removes javascript: hrefs regardless of case, entities or autolink form', () => {
    for (const md of [
      '[x](JavaScript:alert(1))',
      '[x](&#106;avascript:alert(1))',
      '<javascript:alert(1)>',
      '[x][r]\n\n[r]: javascript:alert(1)',
    ]) {
      expect(html(md)).not.toMatch(/href/i);
    }
  });

  it('removes data: and vbscript: hrefs', () => {
    expect(html('[x](data:text/html,<script>alert(1)</script>)')).not.toMatch(/href/);
    expect(html('[x](vbscript:msgbox)')).not.toMatch(/href/);
  });

  it('unwraps markdown constructs outside the allowlist instead of emitting them', () => {
    expect(html('![alt](https://evil.example/x.png)')).toBe('<p></p>');
    expect(html('## Heading')).toBe('Heading');
    expect(html('`code`')).toBe('<p>code</p>');
  });

  it('does not let a link title break out of the attribute', () => {
    const out = html('[x](https://a.example "t\\" onmouseover=\\"alert(1)")');
    expect(out).toContain('title="t&#x22; onmouseover=&#x22;alert(1)"');
    expect(out).not.toMatch(/" onmouseover=/);
  });
});

describe('markdownToSafeHtml: allowed markup', () => {
  it('keeps emphasis', () => {
    expect(html('**bold** and _em_')).toBe('<p><strong>bold</strong> and <em>em</em></p>');
  });

  it('keeps relative, mailto and tel links', () => {
    expect(html('[a](/signal/#settings) [b](mailto:x@example.org) [c](tel:+15555550100)')).toBe(
      '<p><a href="/signal/#settings">a</a> <a href="mailto:x@example.org">b</a> ' +
        '<a href="tel:+15555550100">c</a></p>',
    );
  });

  it('marks external links target=_blank with rel=noopener noreferrer', () => {
    expect(html('[EFF](https://ssd.eff.org/)')).toBe(
      '<p><a href="https://ssd.eff.org/" target="_blank" rel="noopener noreferrer">EFF</a></p>',
    );
  });

  it('keeps lists, line breaks and blockquotes', () => {
    expect(html('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
    expect(html('3. three\n4. four')).toMatch(/^<ol start="3">/);
    expect(html('line one  \nline two')).toBe('<p>line one<br>\nline two</p>');
    expect(html('> quoted')).toBe('<blockquote>\n<p>quoted</p>\n</blockquote>');
  });

  it('wraps paragraphs in span.inline-markdown when inlineOnly', () => {
    expect(html('DO: use **Signal**', { inlineOnly: true })).toBe(
      '<span class="inline-markdown">DO: use <strong>Signal</strong></span>',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(markdownToSafeHtml('')).toBe('');
    expect(markdownToSafeHtml(undefined)).toBe('');
  });
});
