import { describe, expect, it } from 'vitest';
import { requireAnnotationsEnabled } from './http';
import type { AnnotationsRuntimeConfig } from './env';

describe('requireAnnotationsEnabled', () => {
  it('blocks API when runtime config has enabled: false', () => {
    const gate = requireAnnotationsEnabled(() =>
      ({ enabled: false, publicReadWrite: false } satisfies AnnotationsRuntimeConfig)
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(404);
    }
  });

  it('allows API when enabled: true', () => {
    const gate = requireAnnotationsEnabled(() =>
      ({ enabled: true, publicReadWrite: false } satisfies AnnotationsRuntimeConfig)
    );
    expect(gate.ok).toBe(true);
  });
});
