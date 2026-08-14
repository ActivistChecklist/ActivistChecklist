'use client';
import { createContext, useContext } from 'react';

/**
 * Provides a map of checklist item data keyed by slug.
 *
 * Shape: { [slug]: { frontmatter, serializedBody } }
 *
 * Used by the MDX <ChecklistItem slug="..."> wrapper to look up
 * item data when rendering guide pages from MDX.
 */
export const ChecklistItemsContext = createContext({});

export const useChecklistItems = () => useContext(ChecklistItemsContext);

/**
 * Client boundary that exposes resolved checklist items to any embedded
 * `<ChecklistItem slug="...">` in its subtree. Lets a Server Component (e.g. the
 * route) supply the data without the rendered page/guide component needing to
 * know about it.
 */
export function ChecklistItemsProvider({ items = {}, children }) {
  return (
    <ChecklistItemsContext.Provider value={items}>
      {children}
    </ChecklistItemsContext.Provider>
  );
}
