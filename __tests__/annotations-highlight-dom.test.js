// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import {
  applyDraftQuoteHighlight,
  applyThreadHighlights,
  clearDraftQuoteHighlights,
  clearThreadHighlights,
  computeQuoteDocumentOrder,
} from '@/features/annotations/highlightDom'

function createRoot(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('highlightDom', () => {
  it('highlights draft quotes across multiple elements', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>')
    const before = root.textContent

    applyDraftQuoteHighlight(root, 'Alpha Beta Gamma')

    const spans = root.querySelectorAll('span[data-annotation-draft]')
    expect(spans.length).toBeGreaterThan(1)
    expect(root.textContent).toBe(before)
  })

  it('matches scrubbed selection across block elements (spaced fallback)', () => {
    const root = createRoot('<p>Hello</p><p>World</p>')
    document.body.appendChild(root)

    applyDraftQuoteHighlight(root, 'Hello World')

    const spans = root.querySelectorAll('span[data-annotation-draft]')
    expect(spans.length).toBe(2)
    expect(computeQuoteDocumentOrder(root, 'Hello World')).toBe(0)

    root.remove()
  })

  it('matches very long quotes without giant regex (normalized spaced substring)', () => {
    const words = Array.from({ length: 220 }, (_, i) => `w${i}`).join(' ')
    const root = createRoot(`<p>${words}</p>`)
    document.body.appendChild(root)

    applyDraftQuoteHighlight(root, words)

    const spans = root.querySelectorAll('span[data-annotation-draft]')
    expect(spans.length).toBeGreaterThan(0)
    root.remove()
  })

  it('matches long quote across headings and paragraphs', () => {
    const half = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ')
    const root = createRoot(`<h2>A</h2><p>${half}</p><p>${half}</p>`)
    document.body.appendChild(root)
    const quote = `A ${half} ${half}`

    applyDraftQuoteHighlight(root, quote)

    const spans = root.querySelectorAll('span[data-annotation-draft]')
    expect(spans.length).toBeGreaterThan(0)
    root.remove()
  })

  it('clears draft highlight nodes cleanly', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>')
    const before = root.textContent

    applyDraftQuoteHighlight(root, 'Alpha Beta Gamma')
    expect(root.querySelectorAll('span[data-annotation-draft]').length).toBeGreaterThan(0)

    clearDraftQuoteHighlights(root)

    expect(root.querySelectorAll('span[data-annotation-draft]').length).toBe(0)
    expect(root.textContent).toBe(before)
  })

  it('applies thread highlights across element boundaries and returns order map', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>')
    const before = root.textContent
    const threads = [
      { id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' },
    ]

    const orderById = applyThreadHighlights(root, threads, () => {})

    const spans = root.querySelectorAll('span[data-annotation-thread-id="t1"]')
    expect(spans.length).toBeGreaterThan(1)
    expect(orderById.t1).toBe(0)
    expect(root.textContent).toBe(before)
  })

  it('renders overlapping thread highlights including newer one', () => {
    const root = createRoot('<p>Alpha Beta Gamma Delta</p>')
    const threads = [
      { id: 'older', status: 'open', quote_text: 'Alpha Beta Gamma' },
      { id: 'newer', status: 'open', quote_text: 'Beta Gamma Delta' },
    ]

    const orderById = applyThreadHighlights(root, threads, () => {})

    expect(orderById.older).toBe(0)
    expect(orderById.newer).toBe(6)
    expect(root.querySelectorAll('span[data-annotation-thread-id="older"]').length).toBeGreaterThan(0)
    expect(root.querySelectorAll('span[data-annotation-thread-id="newer"]').length).toBeGreaterThan(0)
  })

  it('applies hover color to all segments of same thread', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>')
    document.body.appendChild(root)
    const threads = [
      { id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' },
    ]

    applyThreadHighlights(root, threads, () => {})
    const spans = root.querySelectorAll('span[data-annotation-thread-id="t1"]')
    expect(spans.length).toBeGreaterThan(1)

    spans[0].dispatchEvent(new window.Event('mouseenter', { bubbles: true }))
    spans.forEach((span) => {
      expect(span.style.backgroundColor).toBe('rgba(245, 158, 11, 0.5)')
    })
    root.remove()
  })

  it('does not highlight resolved threads in content', () => {
    const root = createRoot('<p>Alpha Beta Gamma</p>')
    const threads = [
      { id: 'resolved-1', status: 'resolved', quote_text: 'Alpha Beta' },
    ]

    const orderById = applyThreadHighlights(root, threads, () => {})

    expect(Object.keys(orderById)).toHaveLength(0)
    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBe(0)
  })

  it('clears thread highlight nodes cleanly', () => {
    const root = createRoot('<p>Alpha <em>Beta</em> Gamma</p>')
    const before = root.textContent
    const threads = [
      { id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' },
    ]

    applyThreadHighlights(root, threads, () => {})
    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBeGreaterThan(0)

    clearThreadHighlights(root)

    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBe(0)
    expect(root.textContent).toBe(before)
  })
})
