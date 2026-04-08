import { describe, expect, it } from 'vitest';
import { requireReviewCommentsEnabled } from './http';
import type { ReviewCommentsRuntimeConfig } from './env';

describe('requireReviewCommentsEnabled', () => {
  it('blocks API when runtime config has enabled: false', () => {
    const gate = requireReviewCommentsEnabled(() =>
      ({ enabled: false, publicReadWrite: false } satisfies ReviewCommentsRuntimeConfig)
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(404);
    }
  });

  it('allows API when enabled: true', () => {
    const gate = requireReviewCommentsEnabled(() =>
      ({ enabled: true, publicReadWrite: false } satisfies ReviewCommentsRuntimeConfig)
    );
    expect(gate.ok).toBe(true);
  });
});
