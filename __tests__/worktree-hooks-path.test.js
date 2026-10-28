import { describe, it, expect } from 'vitest';
import { shouldUnsetWorktreeHooksPath } from '../scripts/lib/worktree-hooks-path.cjs';

const MAIN = '/Users/me/dev/repo';
const WORKTREE = '/Users/me/dev/repo/.claude/worktrees/feature-abc';

// The situation every app-created worktree starts in, once pnpm install has run.
const stale = {
  isLinkedWorktree: true,
  worktreeConfigEnabled: true,
  worktreeHooksPath: `${MAIN}/.husky/_`,
  worktreeRoot: WORKTREE,
  ownHooksReady: true,
};

describe('shouldUnsetWorktreeHooksPath', () => {
  it("unsets an absolute override that points at the main checkout's hooks", () => {
    expect(shouldUnsetWorktreeHooksPath(stale)).toBe(true);
  });

  it('keeps the override until this worktree has its own Husky hooks', () => {
    expect(shouldUnsetWorktreeHooksPath({ ...stale, ownHooksReady: false })).toBe(false);
  });

  it('never touches the main checkout', () => {
    expect(shouldUnsetWorktreeHooksPath({ ...stale, isLinkedWorktree: false })).toBe(false);
  });

  it('leaves config alone when worktree-scoped config is off', () => {
    // Without extensions.worktreeConfig, `git config --worktree --unset` would
    // remove the shared setting for every checkout.
    expect(shouldUnsetWorktreeHooksPath({ ...stale, worktreeConfigEnabled: false })).toBe(false);
  });

  it('does nothing when there is no override', () => {
    expect(shouldUnsetWorktreeHooksPath({ ...stale, worktreeHooksPath: null })).toBe(false);
  });

  it('keeps a relative override, which already resolves inside the worktree', () => {
    expect(shouldUnsetWorktreeHooksPath({ ...stale, worktreeHooksPath: '.husky/_' })).toBe(false);
  });

  it("keeps an absolute override that already points at this worktree's hooks", () => {
    expect(
      shouldUnsetWorktreeHooksPath({ ...stale, worktreeHooksPath: `${WORKTREE}/.husky/_/` }),
    ).toBe(false);
  });

  it('unsets an override pointing at some other hooks directory', () => {
    expect(shouldUnsetWorktreeHooksPath({ ...stale, worktreeHooksPath: '/elsewhere/hooks' })).toBe(
      true,
    );
  });
});
