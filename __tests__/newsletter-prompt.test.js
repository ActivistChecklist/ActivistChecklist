import { describe, it, expect } from 'vitest';
import {
  MAX_VIEWS,
  REST_DAYS,
  parsePromptState,
  recordView,
  shouldShowInlineCta,
} from '../lib/newsletter-prompt';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 2);
const fresh = { done: false, seen: 0, lastSeen: null };

describe('parsePromptState', () => {
  it('treats a missing value as never seen', () => {
    expect(parsePromptState(null)).toEqual(fresh);
  });

  it('treats corrupt or wrongly typed values as never seen', () => {
    expect(parsePromptState('{not json')).toEqual(fresh);
    expect(parsePromptState('"true"')).toEqual(fresh);
    expect(parsePromptState('{"done":"yes","seen":-2,"lastSeen":"yesterday"}')).toEqual(fresh);
  });

  it('reads a stored view count and timestamp', () => {
    expect(parsePromptState(JSON.stringify({ seen: 2, lastSeen: NOW }))).toEqual({
      done: false,
      seen: 2,
      lastSeen: NOW,
    });
  });

  it('reads the done flag', () => {
    expect(parsePromptState('{"done":true}').done).toBe(true);
  });
});

describe('shouldShowInlineCta', () => {
  it('shows to someone who has never seen it', () => {
    expect(shouldShowInlineCta(fresh, NOW)).toBe(true);
  });

  it('never shows after subscribing or dismissing', () => {
    expect(shouldShowInlineCta({ ...fresh, done: true }, NOW)).toBe(false);
  });

  it('rests for REST_DAYS after a view', () => {
    const seenOnce = recordView(fresh, NOW);
    expect(shouldShowInlineCta(seenOnce, NOW + 1000)).toBe(false);
    expect(shouldShowInlineCta(seenOnce, NOW + REST_DAYS * DAY_MS - 1)).toBe(false);
    expect(shouldShowInlineCta(seenOnce, NOW + REST_DAYS * DAY_MS)).toBe(true);
  });

  it('stops for good after MAX_VIEWS views, however long ago', () => {
    let state = fresh;
    for (let i = 0; i < MAX_VIEWS; i++) state = recordView(state, NOW);
    expect(shouldShowInlineCta(state, NOW + 365 * DAY_MS)).toBe(false);
  });

  it('still shows on the last allowed view once the rest is over', () => {
    let state = fresh;
    for (let i = 0; i < MAX_VIEWS - 1; i++) state = recordView(state, NOW);
    expect(shouldShowInlineCta(state, NOW + REST_DAYS * DAY_MS)).toBe(true);
  });
});
