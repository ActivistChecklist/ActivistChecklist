/**
 * Replaces every App Router file matching `app/api/.../route.(ts|tsx|js)` when BUILD_MODE=static.
 * Static export cannot ship real handlers (force-dynamic, server-only deps).
 * New routes under app/api do not require edits to next.config.js.
 */

export const dynamic = 'force-static';

/**
 * Required for dynamic API route segments under `output: 'export'`.
 * Covers both `[...params]` (Keystatic) and `[[...path]]` (review-comments) with one stub.
 */
export function generateStaticParams() {
  return [{ params: ['_'], path: ['_'] }];
}

function notFound() {
  return new Response('Not found', { status: 404 });
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

export async function PUT() {
  return notFound();
}
