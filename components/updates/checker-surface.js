'use client';

import { createContext, useContext } from 'react';

/**
 * The update checker runs in two places: the /updates/ page, and a compact copy
 * inside the "updates" checklist item. Both render the same components and walk
 * the same steps, so a fix to the flow reaches both. Components read this to
 * shrink type and padding, keep the search results in the page flow (checklist
 * item bodies clip anything that overflows them), and drop the page-only extras:
 * the hero, the essentials panel and the "Why this matters" box, which the
 * checklist item already covers.
 */
const UpdateCheckerSurfaceContext = createContext({ inline: false });

export const UpdateCheckerSurfaceProvider = UpdateCheckerSurfaceContext.Provider;

export function useUpdateCheckerSurface() {
  return useContext(UpdateCheckerSurfaceContext);
}
