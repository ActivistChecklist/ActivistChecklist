import { describe, it, expect } from 'vitest'
import { extractChecklistItems } from '../lib/content'

describe('extractChecklistItems', () => {
  it('extracts a bare slug-only tag', () => {
    expect(extractChecklistItems('<ChecklistItem slug="vpn" />')).toEqual(['vpn'])
  })

  it('extracts when extra attributes follow the slug', () => {
    expect(
      extractChecklistItems('<ChecklistItem slug="vpn" defaultExpanded />')
    ).toEqual(['vpn'])
  })

  it('extracts when the slug is not the first attribute', () => {
    expect(
      extractChecklistItems('<ChecklistItem defaultExpanded slug="vpn" />')
    ).toEqual(['vpn'])
  })

  it('handles an expression-valued attribute', () => {
    expect(
      extractChecklistItems('<ChecklistItem slug="vpn" defaultExpanded={true} />')
    ).toEqual(['vpn'])
  })

  it('handles single-quoted slugs', () => {
    expect(extractChecklistItems("<ChecklistItem slug='signal' />")).toEqual([
      'signal',
    ])
  })

  it('finds multiple items across a document and dedupes', () => {
    const content = `
      <Section>
        <ChecklistItem slug="signal" />
        <ChecklistItem slug="browser" defaultExpanded />
        <ChecklistItem slug="signal" />
      </Section>
    `
    expect(extractChecklistItems(content)).toEqual(['signal', 'browser'])
  })

  it('returns an empty array when there are no items', () => {
    expect(extractChecklistItems('# Just a heading\n\nSome prose.')).toEqual([])
  })
})
