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

### typescript 7: blocker lifted, not yet taken

- **We are on:** `6.0.3` (exact)
- **Available:** `7.0.2` (was Dependabot #575, closed)
- **Status:** the blocker is **gone** as of the Next 16 upgrade on 2026-08-28.
  Next.js 15 could not build with the TS7 native compiler and told us to
  "upgrade to a Next.js v16.2.11 or later to get support for TypeScript 7".
  We are now on 16.3.3, so that condition is satisfied.
- **Already known good:** `tsc --noEmit` exits 0 on 7.0.2 and the full test
  suite passes. What was never verified is `next build` on 16.x with TS 7.
- **Take it when:** now, once someone runs the check below and it passes.
- **How to check:** set `typescript` to `7.0.2`, `pnpm install`, then
  `pnpm exec tsc --noEmit && pnpm buildstatic`.
- **Why it is still an ignore rule:** the rule stays only so the bump does not
  land unreviewed. Drop it the moment the check above passes.
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

### next 16: cleared 2026-08-28, taken

Was held on `^15.5.23` with no recorded reason. Now on `^16.3.3` (with
`@next/env` realigned to `^16.3.3`, which had drifted to 16.x while `next`
stayed on 15.x).

**The one change required:** Next 16 makes Turbopack the default bundler for
`next build`, and Turbopack ignores this repo's custom `webpack:` config,
including the `@` path alias and the `NormalModuleReplacementPlugin` calls that
swap in `lib/stubs/*` for static export. Without the opt-out the build dies on
module-not-found. So `build` is now:

```
"build": "NEXT_TELEMETRY_DISABLED=1 next build --webpack"
```

Verified: `pnpm buildstatic` exits 0 through the whole pipeline (build,
`check-build`, `check-links`, `validate-build`, plus the postbuild sitemap /
RSS / llms.txt / pagefind steps). 109 HTML files, 35 per locale, 267 internal
paths resolved. `tsc --noEmit` exits 0, 1031 tests pass, and `next dev` boots
and serves a correct page.

**Side effects to be aware of:**

- Next rewrote `tsconfig.json`: `jsx` changed from `preserve` to `react-jsx`
  (Next calls this mandatory) and `include` gained `.next/dev/types/**/*.ts`,
  since `next dev` now writes to `.next/dev` so dev and build can run at once.
- Next appends a managed `<!-- BEGIN:nextjs-agent-rules -->` block to
  `AGENTS.md` on every `next dev`. It is committed deliberately, because
  removing it just recreates an uncommitted change. Set `agentRules: false` in
  `next.config.js` to stop it.
- The static export now also emits `out/__next.*.txt` RSC prefetch payloads.
  Checked: they contain only values already present in the rendered HTML, so
  they add no new exposure.

**Still outstanding:** `middleware.ts` is deprecated in favour of `proxy.ts`.
It still works and Next 16 already reports it as "Proxy (Middleware)". Renaming
is not cosmetic, because `proxy` does not support the edge runtime and would
move the next-intl middleware onto the Node runtime, so it deserves its own
change. A real deploy has not been exercised either; only the local static
export and test suite.

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
