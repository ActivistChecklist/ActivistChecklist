import { handleReviewCommentsRequest } from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from '@/lib/review-comments/env';
import { isDbConnectivityError, describeDbConnectivityError } from '@/lib/review-comments/db-errors';

export const dynamic = 'force-dynamic';

const handlerOptions = {
  getReviewCommentsRuntimeConfig: getReviewCommentsConfig,
};

async function handler(request, context) {
  try {
    return await handleReviewCommentsRequest(request, context, handlerOptions);
  } catch (error) {
    // Genuine application bugs still surface as a 500 with their stack trace.
    if (!isDbConnectivityError(error)) {
      throw error;
    }

    // The upstream handler misses DNS failures like `ENOTFOUND
    // mongodb.railway.internal` and re-throws, which Next renders as an opaque
    // 500 on every request. Catch that here so a misconfigured environment
    // degrades gracefully instead of spamming stack traces.
    const { code, hostname } = describeDbConnectivityError(error);

    // One concise line, not the full repeated stack. Log only extracted,
    // non-sensitive fields — never the raw error or connection string, which
    // can contain credentials.
    console.warn(
      `[review-comments] MongoDB unreachable (${code || 'unknown'}${hostname ? ` ${hostname}` : ''}); serving degraded response.`
    );

    const body = {
      error: 'Review comments database is unavailable',
      dbOffline: true,
      code: code || null,
    };

    // Reads degrade to empty with HTTP 200 (matches the package's own
    // `dbOffline` contract, so the client Shell renders no comments quietly).
    // Writes report 503 so the client composers surface the failure to the user.
    const status = request.method === 'GET' ? 200 : 503;
    return Response.json(body, { status });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
