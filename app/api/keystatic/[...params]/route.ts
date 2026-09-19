import { makeRouteHandler } from '@keystatic/next/route-handler';
import type { NextRequest } from 'next/server';
import keystaticConfig, { showKeystaticUI } from '../../../../keystatic.config';
import { rewriteRequestUrlForPublicOrigin } from '@/lib/keystatic-public-request-url';
import { beautifyGithubOauthCallbackCloseIfNeeded } from '@/lib/keystatic-github-oauth-callback-response';

/** Server deployments (OAuth, GitHub API). Static export swaps this file for `lib/stubs/api-route-static.ts`. */
export const dynamic = 'force-dynamic';

function notFoundRouteHandler() {
  return new Response(null, { status: 404 });
}

function missingSecretsResponse() {
  return new Response(
    'Keystatic is not configured (set KEYSTATIC_GITHUB_CLIENT_ID, KEYSTATIC_GITHUB_CLIENT_SECRET, KEYSTATIC_SECRET on the host).',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
}

/** Bracket keys so Next’s build-time env inlining does not freeze empty values for Railway/runtime secrets. */
function hasGithubKeystaticSecrets() {
  const env = process.env;
  return Boolean(
    env['KEYSTATIC_GITHUB_CLIENT_ID'] &&
    env['KEYSTATIC_GITHUB_CLIENT_SECRET'] &&
    env['KEYSTATIC_SECRET']
  );
}

/**
 * Lazy-init: `makeRouteHandler` must not run at module load during `next build`, or Railway/CI
 * fails (secrets exist at runtime, not always during build). In development, Keystatic allows
 * missing secrets (setup flow); in production, missing secrets → 503 instead of throw.
 */
let keystaticHandlers: {
  GET: (req: NextRequest) => ReturnType<ReturnType<typeof makeRouteHandler>['GET']>;
  POST: (req: NextRequest) => ReturnType<ReturnType<typeof makeRouteHandler>['POST']>;
} | null = null;

function ensureKeystaticHandlers() {
  if (!showKeystaticUI) {
    return null;
  }
  if (keystaticHandlers) {
    return keystaticHandlers;
  }
  if (!hasGithubKeystaticSecrets() && process.env.NODE_ENV !== 'development') {
    return null;
  }
  const { GET: keystaticGET, POST: keystaticPOST } = makeRouteHandler({
    config: keystaticConfig,
  });
  keystaticHandlers = {
    GET: (request: NextRequest) => keystaticGET(rewriteRequestUrlForPublicOrigin(request)),
    POST: (request: NextRequest) => keystaticPOST(rewriteRequestUrlForPublicOrigin(request)),
  };
  return keystaticHandlers;
}

export async function GET(request: NextRequest) {
  const handlers = ensureKeystaticHandlers();
  if (!handlers) {
    return !showKeystaticUI ? notFoundRouteHandler() : missingSecretsResponse();
  }
  const res = await handlers.GET(request);
  return beautifyGithubOauthCallbackCloseIfNeeded(request, res);
}

export async function POST(request: NextRequest) {
  const handlers = ensureKeystaticHandlers();
  if (!handlers) {
    return !showKeystaticUI ? notFoundRouteHandler() : missingSecretsResponse();
  }
  return handlers.POST(request);
}
