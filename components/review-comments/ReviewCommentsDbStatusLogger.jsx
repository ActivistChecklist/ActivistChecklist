'use client';

import { useEffect } from 'react';

/**
 * Client-side visibility for review-comments backend outages.
 *
 * The upstream Shell swallows read failures silently (`.catch(() => {})`), so a
 * reviewer opening a page whose Mongo backend is unreachable (e.g. a Railway
 * preview where the private Mongo host does not resolve) just sees comments
 * quietly missing, with nothing in the console. Writes already log via the
 * package composers; this covers the otherwise-silent initial read path with a
 * single lightweight probe on mount.
 *
 * Only runs when review comments are enabled (internal reviewer builds), so it
 * adds no traffic for public visitors.
 */
export default function ReviewCommentsDbStatusLogger({ enabled, apiBase = '/api/review-comments' }) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const controller = new AbortController();
    // Fail fast so an unreachable DB (server selection can hang ~30s) doesn't
    // leave a pending request; we only need the signal, not the data.
    const timeout = setTimeout(() => controller.abort(), 8000);
    const base = String(apiBase).replace(/\/$/, '');

    fetch(`${base}/overview`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }
        if (!response.ok || payload?.dbOffline) {
          console.warn(
            '[review-comments] Comments backend is unavailable; comments will not load.',
            { status: response.status, code: payload?.code ?? null }
          );
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.warn('[review-comments] Failed to reach comments backend.', error);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, apiBase]);

  return null;
}
