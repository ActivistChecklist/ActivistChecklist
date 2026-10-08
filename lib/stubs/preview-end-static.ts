/** Replaces draft preview end route when BUILD_MODE=static (no server runtime). */

export const dynamic = 'force-static';

export async function POST() {
  return new Response('Draft preview is not available in static export builds.', {
    status: 404,
  });
}
