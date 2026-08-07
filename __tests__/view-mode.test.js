import { describe, it, expect } from 'vitest';
import { resolveViewMode, storageKeyForGuide } from '../lib/view-mode-resolver';

describe('resolveViewMode', () => {
  it('prefers a valid URL param over stored value', () => {
    expect(resolveViewMode('compact', 'detailed')).toBe('compact');
    expect(resolveViewMode('detailed', 'compact')).toBe('detailed');
  });

  it('falls back to stored value when URL param is absent or invalid', () => {
    expect(resolveViewMode(null, 'compact')).toBe('compact');
    expect(resolveViewMode(undefined, 'compact')).toBe('compact');
    expect(resolveViewMode('bogus', 'compact')).toBe('compact');
  });

  it('defaults to detailed when both inputs are missing or invalid', () => {
    expect(resolveViewMode(null, null)).toBe('detailed');
    expect(resolveViewMode('', '')).toBe('detailed');
    expect(resolveViewMode('garbage', 'also-garbage')).toBe('detailed');
  });
});

describe('storageKeyForGuide', () => {
  it('produces a per-guide namespaced key', () => {
    expect(storageKeyForGuide('action')).toBe('checklist-view:action');
    expect(storageKeyForGuide('protest')).toBe('checklist-view:protest');
  });

  it('keeps different guides isolated', () => {
    expect(storageKeyForGuide('action')).not.toBe(storageKeyForGuide('protest'));
  });
});
