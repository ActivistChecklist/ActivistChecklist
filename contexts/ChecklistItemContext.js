'use client';

import { createContext, useContext } from 'react';

/**
 * Lets a component inside a checklist item's body see whether its item is
 * expanded. Item bodies stay mounted while collapsed (ChecklistItem hides them
 * with CSS), so a widget that fetches data can wait for `expanded` instead of
 * loading on every guide view.
 *
 * Null outside a checklist item.
 */
const ChecklistItemContext = createContext(null);

export const ChecklistItemProvider = ChecklistItemContext.Provider;

export function useChecklistItem() {
  return useContext(ChecklistItemContext);
}
