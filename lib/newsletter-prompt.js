/**
 * When to show the inline newsletter box (components/InlineCta.js).
 *
 * Once someone subscribes (through any form) or clicks the box's X, it never
 * shows again. Otherwise each time it is actually seen it rests for
 * REST_DAYS, and after MAX_VIEWS sightings it stops for good.
 *
 * Subscribing and dismissing write the same `done` flag on purpose: someone
 * going through the device can't tell from it that the person subscribed.
 * The email address is never stored.
 */

export const NEWSLETTER_PROMPT_STORAGE_KEY = 'newsletter-prompt';
export const REST_DAYS = 7;
export const MAX_VIEWS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse the stored value. Anything missing or malformed counts as never seen. */
export function parsePromptState(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') return { done: false, seen: 0, lastSeen: null };
  return {
    done: data.done === true,
    seen: Number.isInteger(data.seen) && data.seen > 0 ? data.seen : 0,
    lastSeen: Number.isFinite(data.lastSeen) ? data.lastSeen : null,
  };
}

export function shouldShowInlineCta(state, now) {
  if (state.done) return false;
  if (state.seen >= MAX_VIEWS) return false;
  if (state.lastSeen !== null && now < state.lastSeen + REST_DAYS * DAY_MS) return false;
  return true;
}

export function recordView(state, now) {
  return { ...state, seen: state.seen + 1, lastSeen: now };
}

export function readPromptState() {
  try {
    return parsePromptState(localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY));
  } catch {
    // localStorage may be unavailable (private mode, etc.); treat as never seen
    return parsePromptState(null);
  }
}

function writePromptState(state) {
  try {
    localStorage.setItem(NEWSLETTER_PROMPT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable; the box just keeps showing
  }
}

export function markNewsletterPromptSeen() {
  writePromptState(recordView(readPromptState(), Date.now()));
}

/** Called after a successful subscribe or a click on the box's X. */
export function markNewsletterPromptDone() {
  writePromptState({ done: true });
}
