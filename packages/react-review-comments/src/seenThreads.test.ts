import { describe, expect, it, beforeEach } from 'vitest';
import type { ReviewCommentsScope } from './types';
import {
  isCommentNewSinceSeen,
  isThreadUnread,
  loadSeenThreadMap,
  reviewCommentAuthorsMatch,
  saveSeenThreadMap,
} from './seenThreads';
import type { RrcThread } from './types';

function scope(key: string): ReviewCommentsScope {
  return { scopeKey: key };
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

describe('isThreadUnread / isCommentNewSinceSeen', () => {
  const baseThread: RrcThread = {
    id: 'th1',
    quote_text: 'q',
    comments: [
      {
        id: 'c1',
        created_by: 'a',
        created_at: '2024-01-01T00:00:00.000Z',
        body: 'one',
      },
      {
        id: 'c2',
        created_by: 'b',
        created_at: '2024-02-01T00:00:00.000Z',
        body: 'two',
      },
    ],
    updated_at: '2024-02-01T00:00:00.000Z',
  };

  it('isThreadUnread when seen stamp does not match thread updated_at', () => {
    expect(isThreadUnread(baseThread, {})).toBe(true);
    expect(isThreadUnread(baseThread, { th1: '2024-01-01T00:00:00.000Z' })).toBe(true);
    expect(isThreadUnread(baseThread, { th1: '2024-02-01T00:00:00.000Z' })).toBe(false);
  });

  it('isCommentNewSinceSeen marks replies after lastSeen', () => {
    const seen = { th1: '2024-01-01T00:00:00.000Z' };
    expect(isCommentNewSinceSeen(baseThread.comments[0], baseThread, seen)).toBe(false);
    expect(isCommentNewSinceSeen(baseThread.comments[1], baseThread, seen)).toBe(true);
  });

  it('isCommentNewSinceSeen picks newest comment when thread never seen', () => {
    expect(isCommentNewSinceSeen(baseThread.comments[0], baseThread, {})).toBe(false);
    expect(isCommentNewSinceSeen(baseThread.comments[1], baseThread, {})).toBe(true);
  });

  it('does not treat own comments as new when currentAuthor matches created_by', () => {
    const seen = { th1: '2024-01-01T00:00:00.000Z' };
    expect(isCommentNewSinceSeen(baseThread.comments[1], baseThread, seen, 'b')).toBe(false);
  });

  it('isThreadUnread is false when only new activity is from currentAuthor', () => {
    const mineOnly: RrcThread = {
      id: 'th2',
      quote_text: 'q',
      comments: [
        {
          id: 'c1',
          created_by: 'Me',
          created_at: '2024-03-01T00:00:00.000Z',
          body: 'solo',
        },
      ],
      updated_at: '2024-03-01T00:00:00.000Z',
    };
    expect(isThreadUnread(mineOnly, {}, 'Me')).toBe(false);
    expect(isThreadUnread(mineOnly, {}, 'Other')).toBe(true);
  });
});

describe('reviewCommentAuthorsMatch', () => {
  it('compares trimmed case-insensitively', () => {
    expect(reviewCommentAuthorsMatch('  A  ', 'a')).toBe(true);
    expect(reviewCommentAuthorsMatch('x', 'y')).toBe(false);
  });
});
