/**
 * Replaces annotation API routes when BUILD_MODE=static.
 * Static export must not ship annotation handlers.
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
