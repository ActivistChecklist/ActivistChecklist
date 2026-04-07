import { describe, expect, it, beforeEach } from 'vitest';
import type { ReviewCommentsScope } from './types';
import { loadSeenThreadMap, saveSeenThreadMap } from './seenThreads';

function scope(key: string): ReviewCommentsScope {
  return {
    scopeKey: key,
    repoFullName: key,
    prNumber: 'default',
    deploymentKey: 'default',
  };
}

describe('seenThreads storage keys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates read/unread state per domain (scopeKey)', () => {
    const a = scope('www.example.com');
    const b = scope('other.net');
    saveSeenThreadMap(a, { t1: '2020-01-01' });
    saveSeenThreadMap(b, { t2: '2020-02-02' });

    expect(loadSeenThreadMap(a)).toEqual({ t1: '2020-01-01' });
    expect(loadSeenThreadMap(b)).toEqual({ t2: '2020-02-02' });
  });

  it('does not leak seen state when scopeKey changes', () => {
    saveSeenThreadMap(scope('old.preview.app'), { x: '1' });
    expect(loadSeenThreadMap(scope('new.preview.app'))).toEqual({});
  });
});
