import { describe, expect, it } from 'vitest';
import { isReviewCommentsEnabled } from './env';

describe('isReviewCommentsEnabled', () => {
  it('is false for static export builds regardless of REVIEW_COMMENTS_ENABLED', () => {
    expect(
      isReviewCommentsEnabled({
        BUILD_MODE: 'static',
        REVIEW_COMMENTS_ENABLED: 'true',
      } as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it('is true when REVIEW_COMMENTS_ENABLED is set and not static', () => {
    expect(
      isReviewCommentsEnabled({
        REVIEW_COMMENTS_ENABLED: 'true',
      } as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});
