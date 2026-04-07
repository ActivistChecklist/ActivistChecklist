# react-review-comments (`@activistchecklist/react-review-comments`)

Anchored, thread-style review comments for long-form content in **React** and **Next.js**. Highlights selected text, opens a floating panel, and persists threads and replies through a small HTTP API (MongoDB-backed handler included).

Styling is **scoped CSS** (class prefix `rrc-`, optional `rrc-root` wrapper) so host app styles rarely leak in or out. The package does **not** use Tailwind.

> [!WARNING]
> Warning: This library is **alpha**. It is developed for and tested alongside [ActivistChecklist.org](https://activistchecklist.org); it **has not been validated on other deployments or hosting setups** yet. APIs, environment contracts, and Mongo layout may change.

## License

GPL-3.0. See `LICENSE` in this package.

## Install

```bash
yarn add @activistchecklist/react-review-comments
```

Peer dependencies (your app should already have these for the full UI):

- `react`, `react-dom`
- `next` (App Router recommended)
- `@annotorious/react`, `@recogito/react-text-annotator`
- `lucide-react`

Runtime dependency used by the **server handler** only: `mongodb`.

The package is authored in **TypeScript** (`.ts` / `.tsx`). Consumers using **Next.js** should list it in `transpilePackages` (see below). Types are exported from the package entry for the client API, provider props, threads, and labels.

## 1. Styles

**`ReviewCommentsBoundary`** (below) imports scoped CSS for you.

If you compose **`ReviewCommentsProvider`** + **`ReviewCommentsShell`** yourself, import the stylesheet once in that client component:

```jsx
import '@activistchecklist/react-review-comments/styles.css';
```

Optional: wrap the panel in an element with class `rrc-root` (the built-in panel already applies it) to keep CSS variables and `box-sizing` predictable.

## 2. Client: drop-in boundary (recommended)

`ReviewCommentsBoundary` wires the provider, shell, and styles. Pass **`scope`** from the same host the user sees (API handler partitions Mongo data by `Host` / `X-Forwarded-Host`). In a Next.js **server** layout, derive it from `headers()`:

```tsx
import { headers } from 'next/headers';
import {
  ReviewCommentsBoundary,
  reviewCommentsScopeFromHostHeader,
} from '@activistchecklist/react-review-comments';

export default async function Layout({ children, params }) {
  const h = await headers();
  const scope = reviewCommentsScopeFromHostHeader(h.get('x-forwarded-host') || h.get('host'));
  const enabled = /* your feature flag */;
  return (
    <ReviewCommentsBoundary enabled={enabled} path={...} locale={...} scope={scope}>
      {children}
    </ReviewCommentsBoundary>
  );
}
```

Optional props: **`apiBase`** (default `/api/review-comments`), **`labels`** (partial copy overrides).

## 3. Client: provider + shell (manual)

Use this when you need a custom shell or split imports. Wrap the **main article body** (the region users should select text in) with the provider and shell. Pass **`scope`** from `reviewCommentsScopeFromHostHeader` (or `window.location.host` in a client-only tree) so it matches what the API will use.

```jsx
'use client';

import {
  ReviewCommentsProvider,
  ReviewCommentsShell,
} from '@activistchecklist/react-review-comments';
import '@activistchecklist/react-review-comments/styles.css';

export function CommentsWrapper({ enabled, path, locale, scope, children }) {
  return (
    <ReviewCommentsProvider
      apiBase="/api/review-comments"
      enabled={enabled}
      path={path}
      locale={locale}
      scope={scope}
    >
      <ReviewCommentsShell>{children}</ReviewCommentsShell>
    </ReviewCommentsProvider>
  );
}
```

- **`apiBase`**: base URL for fetches (no trailing slash), e.g. `/api/review-comments`.
- **`enabled`**: when `false`, the shell renders `children` only (no panel, no listeners).
- **`path`**: stable document id for this page (e.g. `/guide/foo/` with trailing slash if your site uses one).
- **`locale`**: short locale string, e.g. `en`, `es`.
- **`scope`**: built by **`reviewCommentsScopeFromHostHeader`** (or **`reviewCommentsScopeFromRequest`** on the server). The stock handler stores **`scopeKey`** / **`repoFullName`** as the normalized host (e.g. `preview-abc.vercel.app` vs `www.example.com`); **`prNumber`** / **`deploymentKey`** are set to `default` for schema compatibility.

### Optional: override copy

`ReviewCommentsProvider` accepts **`labels`**: a partial object merged onto English defaults (button labels, errors, panel chrome). See `src/defaultLabels.ts`.

### Next.js: transpile the package

In `next.config.js`, include the package so Next compiles its TypeScript source:

```javascript
transpilePackages: ['@activistchecklist/react-review-comments'],
```

## 4. Next.js App Router: one API route

Add a **catch-all** route and forward everything to the package handler.

`app/api/review-comments/[[...path]]/route.ts` (or `route.js`):

```typescript
import {
  handleReviewCommentsRequest,
  type ReviewCommentsRouteContext,
} from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from './your-app/review-comments-env';

export const dynamic = 'force-dynamic';

const handlerOptions = {
  getAnnotationsRuntimeConfig: getReviewCommentsConfig,
};

function handler(request: Request, context: ReviewCommentsRouteContext) {
  return handleReviewCommentsRequest(request, context, handlerOptions);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

Pass **`getAnnotationsRuntimeConfig`** only for feature flags (`enabled`, public write). Document scope in Mongo always comes from the request **Host** (see `src/scopeFromHost.ts`). If you omit it, the handler uses `server/env.ts` defaults.

The handler reads `context.params` (awaited internally) for subpaths such as `/overview`, `/threads`, `/comments`, etc.

`getAnnotationsRuntimeConfig` only reads **`process.env`** (feature flags, Mongo). **Per-request** rules (who may use the API) belong in **your route** (or middleware): call `handleReviewCommentsRequest` only after your checks pass.

### Gating example 1: signed-in users only

**UI:** enable the shell only when your auth says the user is logged in (server component or loader).

```tsx
import { auth } from '@/auth'; // e.g. Auth.js / your session helper

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <ReviewCommentsBoundary
      enabled={Boolean(session)}
      path={/* … */}
      locale={/* … */}
      scope={/* … */}
    >
      {children}
    </ReviewCommentsBoundary>
  );
}
```

**API:** reject anonymous requests before the stock handler. The client uses **`credentials: 'same-origin'`** on `fetch`, so the **session cookie** is sent automatically; no extra headers are required if your session is cookie-based.

```typescript
import { auth } from '@/auth';
import { handleReviewCommentsRequest, type ReviewCommentsRouteContext } from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from './your-app/review-comments-env';

const handlerOptions = { getAnnotationsRuntimeConfig: getReviewCommentsConfig };

async function gated(request: Request, context: ReviewCommentsRouteContext) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleReviewCommentsRequest(request, context, handlerOptions);
}

export const GET = gated;
export const POST = gated;
export const PATCH = gated;
export const DELETE = gated;
```

Keep **`REVIEW_COMMENTS_ENABLED`** and Mongo env as your global kill switch; `getReviewCommentsConfig` can still return `enabled: false` from env when the feature is off entirely.

### Gating example 2: URL query secret (e.g. preview reviewers)

**UI:** validate the query on the server and pass **`enabled`** from that (do not expose the secret to the client as a prop).

```tsx
export default async function Page({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams: Promise<{ rrc?: string }>;
}) {
  const sp = await searchParams;
  const enabled = sp.rrc === process.env.RRC_REVIEW_SECRET;
  return (
    <ReviewCommentsBoundary enabled={enabled} path={/* … */} locale={/* … */} scope={/* … */}>
      {children}
    </ReviewCommentsBoundary>
  );
}
```

**API:** the default client **does not** append arbitrary query params to every request. Either:

- Set a **short-lived cookie** (e.g. in middleware) when `?rrc=` is valid, and in the route handler require that cookie matches before calling `handleReviewCommentsRequest`, or  
- Use a thin wrapper around **`createReviewCommentsApi`** / custom **`fetch`** that adds the same secret as a **header** (e.g. `X-Rrc-Preview: …`) that your route compares to `process.env.RRC_REVIEW_SECRET`.

```typescript
async function gatedBySecret(request: Request, context: ReviewCommentsRouteContext) {
  const secret = request.headers.get('x-rrc-preview');
  if (secret !== process.env.RRC_REVIEW_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return handleReviewCommentsRequest(request, context, {
    getAnnotationsRuntimeConfig: getReviewCommentsConfig,
  });
}
```

Treat shared secrets like passwords: **rotate them**, prefer **HTTPS**, and do not log them.

## 5. Environment (MongoDB + feature flag)

**Required for the API:**

- **`REVIEW_COMMENTS_ENABLED`**: `true` / `1` / `yes`
- **`REVIEW_COMMENTS_MONGODB_URL`**: connection string. No path segment → database name **`review_comments`**. Collections: **`rrc_*`** (see `server/collections.ts`).

**Optional:**

- **`REVIEW_COMMENTS_PUBLIC_WRITE`**: defaults to **`true`** if unset (anonymous write for PR-style review). When set to **`false`**, the stock handler returns **403** for POST, PATCH, and DELETE; GET routes (list threads, overview) still work for read-only embeds.

Preview vs production is **only** the hostname in the browser (e.g. Vercel preview vs production); no extra env vars for that.

### Security notes

- **No stored HTML**: comment bodies and quotes are plain text; the UI renders them as React text nodes (no `dangerouslySetInnerHTML` in the stock shell).
- **MongoDB**: filters use fixed field names and string parameters. Client-supplied **`anchorSelector`** is sanitized (no `$` keys, no `__proto__` / `constructor` paths, bounded depth and size) before insert.
- **IDs**: thread and comment ids in URL segments and JSON bodies must match a normal **UUID** shape before updates or deletes.
- **Trust model**: there is **no authentication** in the stock handler; scope is derived from **Host** / **X-Forwarded-Host**. Treat this as suitable for low-risk, same-site review comments, not for sensitive or authenticated workflows without adding your own auth layer.

## 6. Static export

If you use `output: 'export'`, do not ship the API route or live comments UI: tree-shake or replace the shell and stub the API with your build, as you would for any dynamic backend.

## API surface (client)

`createReviewCommentsApi(apiBase)` returns methods used by the shell: `fetchThreads`, `fetchOverview`, `createThread`, `createComment`, `patchThreadStatus`, `patchComment`, `deleteComment`. You can reuse these if you build a custom layout.

## Package layout

- **`src/`** – React UI, highlight helpers, client API (`ReviewCommentsBoundary`, provider, shell, `scopeFromHost.ts`).
- **`server/handler.ts`** – `handleReviewCommentsRequest` for Next.js.
- **`server/collections.ts`** – Mongo collection names (`rrc_*`).
- **`shared/sanitize.ts`** – shared normalization for quotes, anchor metadata, and UUID validation.
- **`src/rrc.css`** – scoped panel and thread styles (`rrc-*`).
