import { describe, it, expect } from 'vitest';
import { slugify, truncateText } from '../utils/core';

describe('slugify', () => {
  it('converts basic text to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces into single dash', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('-hello-world-')).toBe('hello-world');
  });

  it('handles numbers', () => {
    expect(slugify('Step 1: Do this')).toBe('step-1-do-this');
  });

  it('respects maxLength config', () => {
    const result = slugify('hello beautiful world', { maxLength: 8 });
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('respects maxWords config', () => {
    expect(slugify('hello beautiful world', { maxWords: 2 })).toBe('hello-beautiful');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles strings with only special characters', () => {
    expect(slugify('!@#$%')).toBe('');
  });
});

describe('truncateText', () => {
  it('returns empty string for null', () => {
    expect(truncateText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(truncateText(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(truncateText('')).toBe('');
  });

  it('returns original text when shorter than maxLength', () => {
    expect(truncateText('short text')).toBe('short text');
  });

  it('truncates and adds ellipsis when exceeding default maxLength', () => {
    const longText = 'a'.repeat(200);
    const result = truncateText(longText);
    expect(result.length).toBeLessThanOrEqual(153); // 150 + '...'
    expect(result).toMatch(/\.\.\.$/u);
  });

  it('respects custom maxLength', () => {
    const result = truncateText('hello world', 5);
    expect(result).toBe('hello...');
  });

  it('returns text exactly at maxLength without truncation', () => {
    const text = 'a'.repeat(150);
    expect(truncateText(text)).toBe(text);
  });
});
