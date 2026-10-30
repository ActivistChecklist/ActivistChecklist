import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';
import { cookies, draftMode } from 'next/headers';
import { cache } from 'react';

import { PREVIEW_GRANT_COOKIE, verifyPreviewGrant } from './preview-grant.js';

/**
 * Key for signing the preview grant cookie, derived from KEYSTATIC_SECRET so it is not the same
 * value Keystatic uses. Without that secret (local dev) a random per-process key is used, which
 * only means previews need restarting after a server restart. Kept on globalThis because route
 * handlers and pages can load separate copies of this module.
 */
export function getPreviewGrantKey() {
  // Bracket access so Next's build-time env inlining does not freeze a missing value.
  const secret = process.env['KEYSTATIC_SECRET'];
  if (secret) {
    return createHmac('sha256', secret).update('activistchecklist-preview-grant-v1').digest();
  }
  globalThis.__acPreviewGrantKey ??= randomBytes(32);
  return globalThis.__acPreviewGrantKey;
}

/**
 * The verified preview grant ({ owner, name, branch }) for this request, or null when draft mode
 * is off or the cookie is missing, expired or tampered with. Deduplicated per request.
 */
export const getPreviewGrant = cache(async function getPreviewGrant() {
  try {
    const dm = await draftMode();
    if (!dm.isEnabled) {
      return null;
    }
  } catch {
    return null;
  }

  const value = (await cookies()).get(PREVIEW_GRANT_COOKIE)?.value;
  return verifyPreviewGrant(value, { key: getPreviewGrantKey(), now: Date.now() });
});
