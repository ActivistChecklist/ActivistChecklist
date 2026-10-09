'use client';

import { useEffect, useState } from 'react';
import ChecklistItemComponent from '@/components/guides/ChecklistItem';
import KeystaticOpenEntryLink, {
  KEYSTATIC_OPEN_ENTRY_PRESET,
} from '@/components/keystatic/KeystaticOpenEntryLink';
import { KEYSTATIC_COLLECTION_CHECKLIST_ITEMS } from '@/lib/keystatic-admin-urls';
import { useKeystaticCollectionItemEditHref } from '@/hooks/use-keystatic-collection-item-edit-href';
import { checklistItemBodyComponents } from '@/lib/mdx-components';
import { SectionContext } from '@/contexts/SectionContext';

const sectionContextValue = {
  expandTrigger: null,
  triggerExpand: () => {},
};

/**
 * Live preview of a checklist item inside Keystatic’s MDX editor (guide body).
 * Loads serialized MDX from /api/keystatic/checklist-item-preview — same pipeline as the public site.
 */
function normalizeSlug(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.slug != null) return String(value.slug);
  return String(value);
}

export default function ChecklistItemEditorPreview({ slug: slugProp }) {
  const slug = normalizeSlug(slugProp);
  const [state, setState] = useState({ status: 'idle', data: null, error: null });
  const editHref = useKeystaticCollectionItemEditHref(KEYSTATIC_COLLECTION_CHECKLIST_ITEMS, slug);

  useEffect(() => {
    if (!slug) {
      setState({ status: 'empty', data: null, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    fetch(`/api/keystatic/checklist-item-preview?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || res.statusText || 'Failed to load');
        }
        return json;
      })
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === 'object' && data.serializedBody != null) {
          setState({ status: 'ready', data, error: null });
        } else {
          setState({
            status: 'error',
            data: null,
            error: 'Invalid preview response',
          });
        }
      })
      .catch((err) => {
        if (!cancelled)
          setState({ status: 'error', data: null, error: err.message || String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug) {
    return <span style={{ color: '#94a3b8' }}>Select a checklist item…</span>;
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return <span style={{ color: '#64748b', fontSize: 12 }}>Loading preview…</span>;
  }

  if (state.status === 'error') {
    return (
      <span style={{ color: '#b91c1c', fontSize: 12 }} title={state.error}>
        Preview failed: {state.error}
      </span>
    );
  }

  // Ready but no payload (e.g. race while Keystatic saves, or non-JSON 200)
  if (!state.data) {
    return <span style={{ color: '#64748b', fontSize: 12 }}>Loading preview…</span>;
  }

  const fm = state.data.frontmatter ?? {};
  const serializedBody = state.data.serializedBody;

  return (
    <SectionContext.Provider value={sectionContextValue}>
      <div className="keystatic-checklist-preview text-[13px] leading-snug [&_.prose]:max-w-none">
        <div className="mb-1 flex justify-end">
          <KeystaticOpenEntryLink
            href={editHref}
            preset={KEYSTATIC_OPEN_ENTRY_PRESET.checklistItem}
          />
        </div>
        <ChecklistItemComponent
          slug={slug}
          title={fm.title}
          type={fm.type}
          why={fm.preview ?? fm.why}
          tools={fm.do ?? fm.tools}
          stop={fm.dont ?? fm.stop}
          titleBadges={fm.titleBadges ?? fm.title_badges ?? []}
          serializedBody={serializedBody}
          bodyComponents={checklistItemBodyComponents}
          expandTrigger={null}
        />
      </div>
    </SectionContext.Provider>
  );
}
