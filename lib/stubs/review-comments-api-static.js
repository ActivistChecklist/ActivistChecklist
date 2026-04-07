/**
 * Replaces `app/api/review-comments/[[...path]]/route.js` when BUILD_MODE=static.
 * Static export must not ship review-comments handlers.
 */
export const dynamic = 'force-static';

function notFound() {
  return Response.json({ error: 'Not found' }, { status: 404 });
}

export async function GET() {
  return notFound();
}

export async function POST() {
  return notFound();
}

export async function PATCH() {
  return notFound();
}

export async function DELETE() {
  return notFound();
}
