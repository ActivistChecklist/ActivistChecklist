import { describe, it, expect } from 'vitest'
import {
  cn,
  formatRelativeDate,
  parseContentDateOnly,
  formatContentDate,
  sentenceCaseCompactRelativePhrase,
} from '../lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('resolves conflicting Tailwind classes', () => {
    // tailwind-merge should keep the last conflicting class
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('resolves conflicting Tailwind padding classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('merges non-conflicting Tailwind classes', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

describe('parseContentDateOnly', () => {
  it('interprets YYYY-MM-DD as local calendar date (not UTC midnight)', () => {
    const d = parseContentDateOnly('2026-04-03')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(3)
    expect(d.getDate()).toBe(3)
  })

  it('returns null for empty input', () => {
    expect(parseContentDateOnly('')).toBe(null)
    expect(parseContentDateOnly(null)).toBe(null)
  })
})

describe('formatContentDate', () => {
  it('formats YYYY-MM-DD without off-by-one vs local calendar', () => {
    const s = formatContentDate('2026-04-03', 'en-US')
    expect(s).toContain('2026')
    expect(s).toContain('3')
    expect(s.toLowerCase()).toContain('april')
  })
})

describe('formatRelativeDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatRelativeDate(null)).toBe('')
    expect(formatRelativeDate(undefined)).toBe('')
    expect(formatRelativeDate('')).toBe('')
  })

  it('returns locale-relative wording for today and yesterday with sentence case (en-US)', () => {
    const today = new Date()
    expect(formatRelativeDate(today.toISOString(), 'en-US')).toBe('Today')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatRelativeDate(yesterday.toISOString(), 'en-US')).toBe('Yesterday')
  })

  it('returns "N days ago" for 2-7 days ago (en-US)', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    expect(formatRelativeDate(threeDaysAgo.toISOString(), 'en-US')).toBe('3 days ago')
  })

  it('uses Spanish relative phrases when dateLocale is es-MX', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    expect(formatRelativeDate(threeDaysAgo.toISOString(), 'es-MX')).toBe('hace 3 días')
  })

  it('sentence-cases Spanish "hoy" for today (es-MX)', () => {
    const today = new Date()
    expect(formatRelativeDate(today.toISOString(), 'es-MX')).toBe('Hoy')
  })

  it('returns formatted date for dates older than 7 days', () => {
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const result = formatRelativeDate(twoWeeksAgo.toISOString())
    // Should be "Mon DD" format (e.g. "Jan 15")
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}/)
  })

  it('includes year for dates from a different year', () => {
    const oldDate = new Date('2020-06-15T12:00:00Z')
    const result = formatRelativeDate(oldDate.toISOString())
    // Should include the year
    expect(result).toContain('2020')
  })
})

describe('sentenceCaseCompactRelativePhrase', () => {
  it('capitalizes single-word phrases', () => {
    expect(sentenceCaseCompactRelativePhrase('today')).toBe('Today')
    expect(sentenceCaseCompactRelativePhrase('yesterday')).toBe('Yesterday')
  })

  it('leaves multi-word phrases unchanged', () => {
    expect(sentenceCaseCompactRelativePhrase('3 days ago')).toBe('3 days ago')
    expect(sentenceCaseCompactRelativePhrase('hace 3 días')).toBe('hace 3 días')
  })
})
