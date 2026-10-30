import { describe, it, expect } from 'vitest';
import { computeSectionProgress } from '../lib/checklist-progress';

describe('computeSectionProgress', () => {
  it('returns null for a section with nothing to check', () => {
    expect(computeSectionProgress([], {})).toBeNull();
    expect(computeSectionProgress(undefined, {})).toBeNull();
  });

  it('counts only items checked as true', () => {
    expect(computeSectionProgress(['a', 'b', 'c'], { a: true, b: false })).toEqual({
      done: 1,
      total: 3,
      complete: false,
    });
  });

  it('marks the section complete when every item is checked', () => {
    expect(computeSectionProgress(['a', 'b'], { a: true, b: true })).toEqual({
      done: 2,
      total: 2,
      complete: true,
    });
  });

  it('ignores checked items that belong to other sections', () => {
    expect(computeSectionProgress(['a'], { a: false, z: true })).toEqual({
      done: 0,
      total: 1,
      complete: false,
    });
  });

  it('counts a repeated slug once', () => {
    expect(computeSectionProgress(['a', 'a', 'b'], { a: true })).toEqual({
      done: 1,
      total: 2,
      complete: false,
    });
  });

  it('treats a missing checked map as nothing done', () => {
    expect(computeSectionProgress(['a'], undefined)).toEqual({
      done: 0,
      total: 1,
      complete: false,
    });
  });
});
