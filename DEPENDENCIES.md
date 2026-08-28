# Dependency decisions

Why we hold certain packages back, and the specific condition that would let us
take the upgrade. The point of this file is that a major bump gets evaluated
**once**, not every time Dependabot reopens the PR.

Enforcement lives in [`.github/dependabot.yml`](.github/dependabot.yml)
(`ignore:`) and [`pnpm-workspace.yaml`](pnpm-workspace.yaml) (`overrides:`).
Every rule there points back to a section here, and every hold here has a rule
there. A hold with no rule just means the PR keeps coming back.

## How to use this file

**Rejecting a bump:** close the PR, add a section under Active holds, add the
matching `ignore` rule.

**Revisiting:** each entry has a *Take it when* line that is checkable, not
"revisit later". If it is satisfied, drop the ignore rule, take the upgrade,
and move the entry to [Cleared](#cleared).

**Reviewing:** sweep quarterly. `pnpm outdated` shows what moved. Update
*Last reviewed* even when the answer is "still holding", so a stale date means
nobody looked rather than nothing changed.

**Before you trust a recorded reason, re-test it.** On the 2026-08-28 sweep,
every hold that had been recorded informally turned out to be either already
fixed upstream or never a hold at all, while two real blockers had no record.
Reasons rot; builds do not lie.

## Active holds

### typescript 7: blocked by Next.js 15, not by our code

- **We are on:** `6.0.3` (exact)
- **Declining:** `7.0.2` (Dependabot #575)
- **Why:** Next.js 15 refuses to build with it. The error is explicit:

  > TypeScript 7.0.2 is not supported by this version of Next.js. The
  > TypeScript 7 native compiler does not provide the JavaScript compiler API
  > that Next.js requires. Install TypeScript 6 (e.g. npm install --save-dev
  > typescript@^6) or upgrade to a Next.js v16.2.11 or later to get support
  > for TypeScript 7.

  Our own code is already TS7-clean: `tsc --noEmit` exits 0 on 7.0.2 and the
  full test suite passes. The only thing missing is Next's build integration.
- **Take it when:** we are on Next.js >= 16.2.11. This is gated entirely on the
  Next 16 decision below, so take both together or neither.
- **How to check:** `pnpm exec tsc --noEmit` (passes today) then
  `BUILD_MODE=static next build` (this is what fails).
- **Last reviewed:** 2026-08-28

### js-yaml 5: blocked by @keystatic/core, and breaks our date handling

- **We are on:** `^4.3.1`
- **Declining:** `5.2.3` (Dependabot #580)
- **Why:** three independent problems, verified by testing v4 and v5 side by side.

  1. **No default export.** v5 is named-exports only.
     [`lib/content.js`](lib/content.js) does `import yaml from 'js-yaml'`, which
     fails outright.
  2. **Dates become strings.** v5 defaults to `CORE_SCHEMA`, so `2026-08-14`
     loads as a `String` instead of a `Date`, and `dump()` writes
     `date: '2026-08-14'` where v4 writes `date: 2026-08-14T00:00:00.000Z`.
     [`scripts/keystatic-format-mdx.mjs`](scripts/keystatic-format-mdx.mjs)
     exists precisely to reproduce Keystatic's `dump()` output byte for byte,
     and its `patchDates()` step assumes `Date` objects.
  3. **`load('')` throws** a `YAMLException` instead of returning `undefined`.

  Problem 2 is the one that cannot be worked around: `@keystatic/core@0.6.8`
  depends on `js-yaml: ^4.1.0`. Moving our direct dependency to v5 while
  Keystatic stays on v4 means our formatter and Keystatic's own writer would
  disagree about frontmatter, producing diff churn on every save.
- **Take it when:** `@keystatic/core` moves to js-yaml 5. Check with
  `npm view @keystatic/core dependencies | grep js-yaml`. Then also fix the
  default import in `lib/content.js` and re-check `patchDates()`.
- **Note:** the tree already carries js-yaml 3.15.1 (via `gray-matter`) and
  4.3.1 (via Keystatic and pm2). Adding a third major is worth avoiding on its
  own.
- **Last reviewed:** 2026-08-28

## Cleared

### lucide-react: cleared 2026-08-28, was pinned at 1.30.0

The pin was `1.30.0` exact plus a `pnpm-workspace.yaml` override, with the
reason "1.33.0 breaks `pnpm buildstatic` (RSC client manifest). See commit msg."
The commit it pointed at had an empty body, so the detail was already lost.

Re-tested on 1.35.0 and 1.34.0: `BUILD_MODE=static next build` exits 0 and
emits the full 73-page static export, and the full test suite passes. Whatever
broke in 1.33.0 is fixed. The override was also unnecessary for deduping,
since `lucide-react` is a root-only direct dependency.

Now tracked as a normal `^1.34.0` caret range with no ignore rule.

**Why 1.34.0 and not 1.35.0:** 1.35.0 was published the same day. pnpm 11's
default `minimumReleaseAge` gate blocks same-day releases, and installing it
anyway makes pnpm write a permanent `minimumReleaseAgeExclude` entry for the
package. That trades a real supply-chain protection for four days of freshness,
which is not a trade worth making on this project. 1.34.0 clears the gate on
its own. The caret range will pick up 1.35.x normally once it ages past the
gate; do not add an exclude entry to force it early.

### @types/node 26: cleared 2026-08-28, taken

Was pinned `25.9.2`. Tested `26.2.0` (Dependabot #578): `tsc --noEmit` exits 0,
full suite passes, `BUILD_MODE=static next build` exits 0 with the same 73-page
output. Taken. `skipLibCheck: true` in `tsconfig.json` keeps this class of bump
low risk.

Still pinned exact by repo convention, so future majors will show up as their
own PR rather than riding in the grouped minor/patch updates.

### @radix-ui/react-slot: never a hold

`1.3.3` is the current latest stable; only `1.4.0-rc` prereleases exist above
it, and Dependabot does not offer prereleases. Nothing was being held back.

The real story is in [`next.config.js`](next.config.js): a stray
`package-lock.json` one directory above the deploy server's checkout made
Next.js treat that as the workspace root and resolve a parallel `node_modules`
with a stale react-slot, failing the build with "createSlot is not exported
from @radix-ui/react-slot". The actual fix was `outputFileTracingRoot`, which
is in place. The override is a belt-and-braces floor, not a ceiling.

Left in place, but it blocks nothing and needs no ignore rule.

## Verified upgradeable, awaiting a decision

### next 16: builds clean, needs a one-line build-script change

Held on `^15.5.23` with no recorded reason. Tested `16.3.3` end to end:

- `BUILD_MODE=static next build --webpack` exits 0 and produces the same static
  export as 15.x, plus one extra `_not-found/index.html`. Nothing is lost.
- Full test suite passes. `pnpm install` reports zero peer-dependency warnings.

**The one required change:** Next 16 makes Turbopack the default bundler for
`next build`. This repo has a custom `webpack:` config in `next.config.js` that
Turbopack ignores, including the `@` path alias and the
`NormalModuleReplacementPlugin` calls that swap in `lib/stubs/*` for static
export. Without the flag the build fails with module-not-found errors. So:

```
"build": "NEXT_TELEMETRY_DISABLED=1 next build --webpack"
```

Everything else in the 16 upgrade guide is already satisfied. Audited and clean:
Node 22 (needs 20.9+), TypeScript 6.0.3 (needs 5.1+), React 19.2.8, and async
`params` already migrated everywhere. Not used at all: AMP, `next lint`,
`serverRuntimeConfig`/`publicRuntimeConfig`, `experimental_ppr`, `dynamicIO`,
`useCache`, `unstable_rootParams`, parallel routes, `next/legacy/image`,
`revalidateTag`, and the `opengraph-image`/`sitemap` file conventions.

**Not blocking, worth doing eventually:**

- `middleware.ts` is deprecated in favour of `proxy.ts`. It still works in 16.
  Note `proxy` does not support the edge runtime, so confirm the next-intl
  middleware is happy on the Node runtime before renaming. Next 16 already
  labels it "Proxy (Middleware)" in build output.
- Turbopack cannot run the static-export stubbing, so `--webpack` is required
  for as long as `next.config.js` uses `NormalModuleReplacementPlugin`. Porting
  the stub mechanism to a Turbopack-native approach is the only way off the flag.

**What has not been verified:** a real deploy. The static export and the test
suite pass locally; `pnpm buildstatic` also runs `check-build`, `check-links`,
and `validate-build`, and the Railway/server path was not exercised. Treat the
extra `_not-found/index.html` as the one output difference to confirm those
scripts tolerate.

## Known future breaks

Not holds, but things that will break on a future major if left alone.

### vitest.config.js will break when Vite defaults to configLoader: 'native'

`vitest.config.js` uses ESM `import`/`export default`, but there is no
`"type": "module"` in `package.json`, so Vite loads it as CommonJS. Current
Vite tolerates this and warns on every `pnpm test`:

> ESM syntax in a file loaded as CommonJS (vitest.config.js:1:1)

A future Vite major makes `configLoader: 'native'` the default and this stops
working. Fix ahead of time by renaming to `vitest.config.mjs`.

## Not holds

Exact-pinned for reproducibility, not because an upgrade is broken. Dependabot
PRs for these are expected and should be merged normally:

- `typescript`, `@types/node`, `@types/react`

Security-floor entries in `pnpm-workspace.yaml` `overrides:` (`picomatch`,
`undici`, `qs`, and so on) are minimums, not ceilings. They raise transitive
dependencies above known-vulnerable versions and block nothing.

`minimumReleaseAgeExclude` should only ever list first-party packages we
publish ourselves. Do not add third-party packages to it to force a same-day
release through the gate.
