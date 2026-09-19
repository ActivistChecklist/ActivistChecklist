import { describe, it, expect } from 'vitest'
import { applyHeadingIds } from '../lib/mdx-heading-ids'

describe('applyHeadingIds', () => {
  it('rewrites an h2 with a trailing {#id} to a raw HTML heading', () => {
    expect(applyHeadingIds('## Downsides {#downsides}').trim()).toBe(
      '<h2 id="downsides">Downsides</h2>'
    )
  })

  it('supports every heading level', () => {
    expect(applyHeadingIds('# A {#a}').trim()).toBe('<h1 id="a">A</h1>')
    expect(applyHeadingIds('###### F {#f}').trim()).toBe('<h6 id="f">F</h6>')
  })

  it('preserves inline markdown in the heading text', () => {
    expect(
      applyHeadingIds('## My **bold** [link](https://x.com) {#foo-bar}').trim()
    ).toBe('<h2 id="foo-bar">My **bold** [link](https://x.com)</h2>')
  })

  it('surrounds the generated heading with blank lines so it stays a block', () => {
    // Regression: without the blank lines, a raw <h2> adjacent to a text line
    // is parsed as inline HTML and wrapped in a <p> (<h2> inside <p>), which
    // is invalid and breaks hydration.
    const src = 'text before\n## Heading {#x}\ntext after'
    expect(applyHeadingIds(src)).toBe(
      'text before\n\n<h2 id="x">Heading</h2>\n\ntext after'
    )
  })

  it('leaves headings without the marker untouched', () => {
    expect(applyHeadingIds('## Plain heading')).toBe('## Plain heading')
  })

  it('leaves non-heading lines untouched', () => {
    const src = 'Some paragraph text.\n\nAnother line.'
    expect(applyHeadingIds(src)).toBe(src)
  })

  it('tolerates whitespace around the id marker', () => {
    expect(applyHeadingIds('##   Spaced   {#id}   ').trim()).toBe(
      '<h2 id="id">Spaced</h2>'
    )
  })

  it('accepts ids with digits, underscores, and hyphens', () => {
    expect(applyHeadingIds('## Step 2 {#step_2-b}').trim()).toBe(
      '<h2 id="step_2-b">Step 2</h2>'
    )
  })

  it('does not rewrite a marker that is not at the end of the line', () => {
    const src = '## Heading {#id} trailing words'
    expect(applyHeadingIds(src)).toBe(src)
  })

  it('does not treat a mid-paragraph {#id} as a heading', () => {
    const src = 'A paragraph mentioning {#id} inline.'
    expect(applyHeadingIds(src)).toBe(src)
  })

  it('does not rewrite headings inside fenced code blocks', () => {
    const src = '```\n## Not a heading {#nope}\n```'
    expect(applyHeadingIds(src)).toBe(src)
  })

  it('rewrites headings after a closed code fence', () => {
    const src = '```\ncode\n```\n\n## Real {#real}'
    const out = applyHeadingIds(src)
    expect(out).toContain('```\ncode\n```')
    expect(out).toContain('<h2 id="real">Real</h2>')
    expect(out).not.toContain('{#real}')
  })

  it('handles multiple headings in one document', () => {
    const src = '## One {#one}\n\ntext\n\n### Two {#two}'
    const out = applyHeadingIds(src)
    expect(out).toContain('<h2 id="one">One</h2>')
    expect(out).toContain('<h3 id="two">Two</h3>')
    expect(out).toContain('text')
    expect(out).not.toContain('{#')
  })

  it('returns falsy/non-string input unchanged', () => {
    expect(applyHeadingIds('')).toBe('')
    expect(applyHeadingIds(undefined)).toBe(undefined)
    expect(applyHeadingIds(null)).toBe(null)
  })

  it('short-circuits when no marker is present', () => {
    const src = '# Title\n\nBody with no ids at all.'
    expect(applyHeadingIds(src)).toBe(src)
  })
})
