/** Replaces draft preview start route when BUILD_MODE=static (no server runtime). */

export const dynamic = 'force-static';

export async function GET() {
  return new Response('Draft preview is not available in static export builds.', {
    status: 404,
  });
}
