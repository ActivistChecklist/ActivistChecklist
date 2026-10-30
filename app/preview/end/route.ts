import { cookies, draftMode } from 'next/headers';

import { PREVIEW_GRANT_COOKIE } from '@/lib/preview-grant';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) {
    return new Response('Invalid origin', { status: 400 });
  }
  const referrer = req.headers.get('Referer');
  if (!referrer) {
    return new Response('Missing Referer', { status: 400 });
  }

  const store = await cookies();
  (await draftMode()).disable();
  for (const name of [PREVIEW_GRANT_COOKIE, 'ks-branch', 'ks-preview-owner', 'ks-preview-repo']) {
    store.delete(name);
  }

  return Response.redirect(referrer, 303);
}
