import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ReviewCommentsProvider } from './context';
import ReviewCommentsShell from './ReviewCommentsShell';
import type { ReviewCommentsScope } from './types';

vi.mock('@annotorious/react', () => ({
  Annotorious: ({ children }: { children: React.ReactNode }) => <div data-mock="annotorious">{children}</div>,
}));

vi.mock('@recogito/react-text-annotator', () => ({
  TextAnnotator: ({ children }: { children: React.ReactNode }) => <div data-mock="text-annotator">{children}</div>,
}));

const scope: ReviewCommentsScope = {
  scopeKey: 'www.example.com',
  repoFullName: 'www.example.com',
  prNumber: 'default',
  deploymentKey: 'default',
};

function mockFetchThreadsAndOverview() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const payload =
      url.includes('/overview') ? { documents: [], dbOffline: true } : { document: null, threads: [], dbOffline: true };
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
}

describe('ReviewCommentsShell — enabled flag', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('when disabled, does not mount the comments panel (no .rrc-aside)', () => {
    const { container } = render(
      <ReviewCommentsProvider
        apiBase="/api/review-comments"
        enabled={false}
        path="/guide/"
        locale="en"
        scope={scope}
      >
        <ReviewCommentsShell>
          <main data-testid="body">Article</main>
        </ReviewCommentsShell>
      </ReviewCommentsProvider>
    );

    expect(container.querySelector('[data-testid="body"]')).toBeTruthy();
    expect(container.querySelector('.rrc-aside')).toBeNull();
    expect(container.querySelector('[data-mock="annotorious"]')).toBeNull();
  });

  it('when enabled, mounts the panel chrome', async () => {
    mockFetchThreadsAndOverview();

    const { container } = render(
      <ReviewCommentsProvider
        apiBase="/api/review-comments"
        enabled
        path="/guide/"
        locale="en"
        scope={scope}
      >
        <ReviewCommentsShell>
          <main>Article</main>
        </ReviewCommentsShell>
      </ReviewCommentsProvider>
    );

    await waitFor(() => {
      expect(container.querySelector('.rrc-aside')).toBeTruthy();
    });
  });
});
