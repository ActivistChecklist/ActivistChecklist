import { describe, expect, it } from 'vitest';
import {
  inferDocumentPathFromPathname,
  normalizeReviewCommentsDocumentPath,
} from './inferAppRouterDocumentPath';

describe('inferAppRouterDocumentPath', () => {
  it('normalizeReviewCommentsDocumentPath', () => {
    expect(normalizeReviewCommentsDocumentPath('/')).toBe('/');
    expect(normalizeReviewCommentsDocumentPath('/foo')).toBe('/foo/');
    expect(normalizeReviewCommentsDocumentPath('/foo/')).toBe('/foo/');
  });

  it('inferDocumentPathFromPathname keeps locale and full path', () => {
    expect(inferDocumentPathFromPathname('/es/foo')).toBe('/es/foo/');
    expect(inferDocumentPathFromPathname('/guide/')).toBe('/guide/');
    expect(inferDocumentPathFromPathname('/')).toBe('/');
  });
});
