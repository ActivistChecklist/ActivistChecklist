import { handleReviewCommentsRequest } from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from '@/lib/review-comments/env';

export const dynamic = 'force-dynamic';

const handlerOptions = {
  getAnnotationsRuntimeConfig: getReviewCommentsConfig,
};

function handler(request, context) {
  return handleReviewCommentsRequest(request, context, handlerOptions);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
