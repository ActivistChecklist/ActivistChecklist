'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { computeSectionProgress } from '@/lib/checklist-progress';

/**
 * Tracks which checklist items are checked, grouped by guide section, so the
 * TOC sidebar and each section's floating header can show progress.
 *
 * Sections register their checkable item slugs; ChecklistItems report their
 * checked state. localStorage stays owned by ChecklistItem; this context only
 * mirrors it in memory.
 *
 * Actions and state are separate contexts so components that only report
 * (every ChecklistItem) don't re-render when another item is checked.
 */
const ProgressActionsContext = createContext({
  registerSection: () => () => {},
  setItemChecked: () => {},
});

const ProgressStateContext = createContext({ sections: {}, checked: {} });

export function ChecklistProgressProvider({ children }) {
  const [sections, setSections] = useState({});
  const [checked, setChecked] = useState({});

  const registerSection = useCallback((sectionSlug, itemSlugs) => {
    setSections((prev) => ({ ...prev, [sectionSlug]: itemSlugs }));
    return () =>
      setSections((prev) => {
        if (prev[sectionSlug] !== itemSlugs) return prev;
        const next = { ...prev };
        delete next[sectionSlug];
        return next;
      });
  }, []);

  const setItemChecked = useCallback((itemSlug, isChecked) => {
    setChecked((prev) =>
      prev[itemSlug] === isChecked ? prev : { ...prev, [itemSlug]: isChecked },
    );
  }, []);

  const actions = useMemo(
    () => ({ registerSection, setItemChecked }),
    [registerSection, setItemChecked],
  );
  const state = useMemo(() => ({ sections, checked }), [sections, checked]);

  return (
    <ProgressActionsContext.Provider value={actions}>
      <ProgressStateContext.Provider value={state}>{children}</ProgressStateContext.Provider>
    </ProgressActionsContext.Provider>
  );
}

export const useChecklistProgressActions = () => useContext(ProgressActionsContext);

/** `{ done, total, complete }` for a registered section, or null. */
export function useSectionProgress(sectionSlug) {
  const { sections, checked } = useContext(ProgressStateContext);
  const itemSlugs = sections[sectionSlug];
  return useMemo(() => computeSectionProgress(itemSlugs, checked), [itemSlugs, checked]);
}

/** Progress for every registered section, keyed by section slug. */
export function useAllSectionProgress() {
  const { sections, checked } = useContext(ProgressStateContext);
  return useMemo(() => {
    const out = {};
    for (const [slug, itemSlugs] of Object.entries(sections)) {
      const progress = computeSectionProgress(itemSlugs, checked);
      if (progress) out[slug] = progress;
    }
    return out;
  }, [sections, checked]);
}
