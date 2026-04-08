# react-review-comments (`@activistchecklist/react-review-comments`)

> [!WARNING]
> Warning: This library is **alpha**. It is developed for and tested alongside [ActivistChecklist.org](https://activistchecklist.org). **It has not been validated on other deployments yet**. APIs, environment contracts, and Mongo layout may change. It may work just fine for you. We'd love help testing it.

Think of this as Google Docs comments for your react site. It is meant to be easy to drop in so reviewers can leave comments on the text of a page.

Many tools put a "dot" on the page for markup-style comments. Those fit poorly when the layout moves (for example accordion sections). This package uses text-based highlighting and comments instead.

It was designed for deploy preview branches (Vercel, Railway, and similar) and may not suit a production site.

## Install

```bash
yarn add @activistchecklist/react-review-comments
```

**Peers:** `react`, `react-dom`, `next` (App Router recommended), `@annotorious/react`, `@recogito/react-text-annotator`, `lucide-react`. The **server handler** also needs **`mongodb`** at runtime.

The package ships **TypeScript** source. If you use **Next.js**, add one line to `next.config.js` (see [When to use `transpilePackages`](#when-to-use-transpilepackages)).

## Quick setup

**1. Client: provider**

In a Next.js layout, add **`ReviewCommentsProvider`**. It includes the shell and styles; **`path`**, **`locale`**, and **`scope`** are optional and inferred from the URL and `window.location.host` when omitted.

```tsx
import { ReviewCommentsProvider } from '@activistchecklist/react-review-comments';

export default async function Layout({ children }) {
  const enabled = true;
  return (
    <ReviewCommentsProvider enabled={enabled}>
      {children}
    </ReviewCommentsProvider>
  );
}
```

**2. Next.js App Router: one API route.** Add a **catch-all** and forward to the package handler.

Add this to `app/api/review-comments/[[...path]]/route.ts` (or `route.js` if you're not using TypeScript):

```typescript
import {
  handleReviewCommentsRequest,
  type ReviewCommentsRouteContext,
} from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from './your-app/review-comments-env';

export const dynamic = 'force-dynamic';

const handlerOptions = {
  getReviewCommentsRuntimeConfig: getReviewCommentsConfig,
};

function handler(request: Request, context: ReviewCommentsRouteContext) {
  return handleReviewCommentsRequest(request, context, handlerOptions);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

**3. Environment variables**

**Required for the API:**

- **`REVIEW_COMMENTS_ENABLED`**: `true`
- **`REVIEW_COMMENTS_MONGODB_URL`**: connection string. If the URL has no database path segment, the database name defaults to **`review_comments`**.

**Optional:** **`REVIEW_COMMENTS_PUBLIC_WRITE`** (see [Environment and security](#environment-and-security)).

Preview vs production is only the hostname in the browser; no extra env vars for that.

---

## Restricting access

The stock handler does not authenticate users. **Who may call the API** is up to your route or middleware: call `handleReviewCommentsRequest` only after your checks pass. `getReviewCommentsRuntimeConfig` is for feature flags (and similar) from **`process.env`**, not per-request auth.

### Example: signed-in users only

**UI:** enable the shell when your auth says the user is logged in.

```tsx
import { auth } from '@/auth'; // e.g. Auth.js / your session helper

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <ReviewCommentsProvider
      enabled={Boolean(session)}
      path={/* … */}
      locale={/* … */}
      scope={/* … */}
    >
      {children}
    </ReviewCommentsProvider>
  );
}
```

**API:** reject anonymous requests before the stock handler. The client uses **`credentials: 'same-origin'`**, so a **session cookie** is sent automatically when your session is cookie-based.

```typescript
import { auth } from '@/auth';
import { handleReviewCommentsRequest, type ReviewCommentsRouteContext } from '@activistchecklist/react-review-comments/server';
import { getReviewCommentsConfig } from './your-app/review-comments-env';

const handlerOptions = { getReviewCommentsRuntimeConfig: getReviewCommentsConfig };

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

Keep **`REVIEW_COMMENTS_ENABLED`** and Mongo env as a global kill switch; `getReviewCommentsConfig` can still return `enabled: false` when the feature is off entirely.

### Example: URL query secret (e.g. preview reviewers)

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
    <ReviewCommentsProvider enabled={enabled} path={/* … */} locale={/* … */} scope={/* … */}>
      {children}
    </ReviewCommentsProvider>
  );
}
```

**API:** the default client **does not** append arbitrary query params to every request. Either:

- Set a **short-lived cookie** (e.g. in middleware) when `?rrc=` is valid, and in the route handler require that cookie before calling `handleReviewCommentsRequest`, or
- Use a thin wrapper around **`createReviewCommentsApi`** / custom **`fetch`** that adds a **header** (e.g. `X-Rrc-Preview: …`) that your route compares to `process.env.RRC_REVIEW_SECRET`.

```typescript
async function gatedBySecret(request: Request, context: ReviewCommentsRouteContext) {
  const secret = request.headers.get('x-rrc-preview');
  if (secret !== process.env.RRC_REVIEW_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  return handleReviewCommentsRequest(request, context, {
    getReviewCommentsRuntimeConfig: getReviewCommentsConfig,
  });
}
```

Treat shared secrets like passwords: **rotate them**, prefer **HTTPS**, and do not log them.

---

## Reference

### Provider props

These apply to **`ReviewCommentsProvider`** (and to **`ReviewCommentsContextProvider`** if you wire the shell yourself).

- **`apiBase`**: base URL for fetches (no trailing slash), e.g. `/api/review-comments`.
- **`enabled`**: when `false`, the shell renders `children` only (no panel, no listeners).
- **`path`**: stable document id for this page (e.g. `/guide/foo/` with a trailing slash if your site uses one).
- **`locale`**: short locale string, e.g. `en`, `es`.
- **`scope`**: `{ scopeKey: string }` from **`reviewCommentsScopeFromHostHeader`** (layouts / client) or **`reviewCommentsScopeFromRequest`** (route handlers). This ties client-side state (for example seen threads in `localStorage`) to the **HTTP host**. The API reads the same host from each request and does **not** accept a separate scope in query or body.

### Optional: override copy

**`labels`**: a partial object merged onto English defaults (button labels, errors, panel chrome). See `src/defaultLabels.ts`.

### When to use `transpilePackages`

Use this **only with Next.js** when you import this package from **`node_modules`** and Next must compile its **TypeScript** (and TSX) for the app build. If your bundler already consumes a precompiled JS build of the package, you do not need it.

```javascript
// next.config.js
module.exports = {
  transpilePackages: ['@activistchecklist/react-review-comments'],
};
```

Types are exported from the package entry for the client API, provider props, threads, and labels.

### Manual context provider + shell

Use **`ReviewCommentsContextProvider`** when you need a custom shell or split imports. Wrap the **main article body** with the context provider and **`ReviewCommentsShell`**. Pass **`scope`** from `reviewCommentsScopeFromHostHeader` (or `window.location.host` in a client-only tree) so it matches what the API will use.

```jsx
'use client';

import {
  ReviewCommentsContextProvider,
  ReviewCommentsShell,
} from '@activistchecklist/react-review-comments';
import '@activistchecklist/react-review-comments/styles.css';

export function CommentsWrapper({ enabled, path, locale, scope, children }) {
  return (
    <ReviewCommentsContextProvider
      apiBase="/api/review-comments"
      enabled={enabled}
      path={path}
      locale={locale}
      scope={scope}
    >
      <ReviewCommentsShell>{children}</ReviewCommentsShell>
    </ReviewCommentsContextProvider>
  );
}
```

### Handler options

Pass **`getReviewCommentsRuntimeConfig`** only for feature flags (`enabled`, public write). Document scope in Mongo always comes from the request **Host** (see `src/scopeFromHost.ts`). If you omit it, the handler uses **`getReviewCommentsRuntimeConfigFromEnv`** in `server/env.ts`.

### Environment and security

**Optional:**

- **`REVIEW_COMMENTS_PUBLIC_WRITE`**: defaults to **`true`** if unset (anonymous write for PR-style review). When set to **`false`**, the stock handler returns **403** for POST, PATCH, and DELETE; GET routes (list threads, overview) still work for read-only embeds.
- **`REVIEW_COMMENTS_CLEANUP_DAYS`**: used by maintenance scripts only (for example `yarn annotations:cleanup`), not required for normal operation.

Collections use the **`rrc_*`** prefix (see `server/collections.ts`).

**Security notes**

- **No stored HTML**: comment bodies and quotes are plain text; the UI renders them as React text nodes (no `dangerouslySetInnerHTML` in the stock shell).
- **MongoDB**: filters use fixed field names and string parameters. Client-supplied **`anchorSelector`** is sanitized (no `$` keys, no `__proto__` / `constructor` paths, bounded depth and size) before insert.
- **IDs**: thread and comment ids in URL segments and JSON bodies must match a normal **UUID** shape before updates or deletes.
- **Trust model**: there is **no authentication** in the stock handler; scope is derived from **Host** / **X-Forwarded-Host**. Treat this as suitable for low-risk, same-site review comments, not for sensitive workflows without your own auth layer.

### Static export

If you use `output: 'export'`, do not ship the API route or live comments UI: tree-shake or replace the shell and stub the API with your build, as you would for any dynamic backend.

### API surface (client)

`createReviewCommentsApi(apiBase)` returns methods used by the shell: `fetchThreads`, `fetchOverview`, `createThread`, `createComment`, `patchThreadStatus`, `patchComment`, `deleteComment`. You can reuse these if you build a custom layout.

### Package layout

- **`src/`** – React UI, highlight helpers, client API (`ReviewCommentsProvider`, `ReviewCommentsContextProvider`, shell, `scopeFromHost.ts`).
- **`server/handler.ts`** – `handleReviewCommentsRequest` for Next.js.
- **`server/collections.ts`** – Mongo collection names (`rrc_*`).
- **`shared/sanitize.ts`** – shared normalization for quotes, anchor metadata, and UUID validation.
- **`src/rrc.css`** – scoped panel and thread styles (`rrc-*`).

## License

GPL-3.0. See `LICENSE` in this package.
