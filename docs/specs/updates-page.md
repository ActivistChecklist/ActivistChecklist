# `/updates` — Device security update checker

## Goal

A single-page tool at `/updates` where a user enters their device (or operating system) and immediately learns whether it still receives security updates. The result is large, unambiguous, and tied back to the rest of the site (essentials guide, security-essentials checklist).

The threat model framing: phones that no longer receive security updates accumulate publicly known vulnerabilities, which raises the risk if the device is seized at a border, confiscated by police, or targeted with spyware. We do not need to be alarmist — we need to be clear.

---

## URL & routing

- Route: `/updates` (and locale-prefixed: `/es/updates`, etc.)
- File: `app/[locale]/updates/page.tsx`
- Static-rendered. The page itself has no per-request data; the dataset is fetched client-side.
- Sitemap: include.
- Index: yes. Title: "Is your device still getting security updates? — Activist Checklist". Meta description summarizes the tool.

---

## High-level UX

```
┌──────────────────────────────────────────────────────────────┐
│              Is your device still getting                     │
│                  security updates?                            │
│                                                               │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│   │  Apple   │ │ Android  │ │ Windows  │ │  Other   │         │
│   │  How to  │ │  How to  │ │  How to  │ │          │         │
│   │ find your│ │ find your│ │ find your│ │          │         │
│   │  model   │ │  model   │ │ version  │ │          │         │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│                                                               │
│   ┌────────────────────────────────────────────────────┐      │
│   │  e.g. iPhone 12 Pro, Pixel 7, Windows 10           │      │
│   └────────────────────────────────────────────────────┘      │
│                                                               │
│       Powered by endoflife.date — updated daily               │
└──────────────────────────────────────────────────────────────┘
```

After a result is shown, the page transitions to a result view (same route, no navigation). Reset returns to the initial state.

### States

1. **Initial.** Heading + 4 family buttons + autocomplete input. No result.
2. **Family modal open.** Clicking a family button opens a modal with an illustrated "how to find your model/version" guide for that platform. Closing returns to initial. Choosing the family also constrains autocomplete (see below).
3. **Searching.** As the user types, autocomplete shows up to 8 best matches grouped by relevance, not strict category. The platform filter (if active) narrows the corpus first.
4. **Result.** A large card replaces the central area. Big icon, big yes/no, supporting copy, CTAs.
5. **Error.** Snapshot couldn't load (network failure, bad JSON). Show a retry button and a fallback link to endoflife.date.

### Reset / back-out flow

- The result view has a prominent "Check another device" button (top-left of the card) that returns to the initial state and clears the input.
- A clear `×` button inside the input field clears the search and any active family filter.
- The active family filter chip (e.g., "Apple ✕") is dismissable and visible above the input.
- Browser back button: result view is pushed onto history as `?q=iphone-12-pro`. Back returns to initial state without losing scroll. (Use `router.replace` for keystrokes; `router.push` only when committing a result.)
- `Esc` while focused in the input clears the input. `Esc` while result is visible returns to initial state.

### Autocomplete behavior

- Single combobox, fuzzy match (`fuse.js` — already lightweight, ~5KB). Match against `label`, `aliases`, and a synthesized "family" string.
- **No strict grouping.** Best match floats to top regardless of category. Each row shows a small icon (Apple / Google / Samsung / Microsoft / etc.) and a category pill (`Phone` / `Tablet` / `Watch` / `OS`).
- **Ranking combines fuzzy-match score and release recency.** Newer devices/OS releases bubble up because more users own them. Concretely:
  - Each result has a `matchScore` ∈ [0, 1] from fuse.js (1 = perfect match) and a `recencyScore` ∈ [0, 1] derived from `releaseDate` (today = 1, falling off linearly to 0 at ~10 years old; clamped).
  - Combined: `rank = (matchScore * 0.7) + (recencyScore * 0.3)`. Match relevance dominates so a search for "iPhone 6" still surfaces the iPhone 6 first; recency only acts as a tiebreaker among similarly-relevant matches and to order an empty/very-broad query (e.g., browsing the Apple family with no text).
  - Releases with no `releaseDate` (rare) get `recencyScore = 0`.
  - Tunable weights live in one constant — adjust after dogfooding.
- Empty input + family filter active → list is sorted by recency alone (newest first), since there's no match score to factor in.
- Max 8 results. Keyboard navigable (↑/↓/Enter/Esc). ARIA combobox pattern.
- "No matches" state offers: "Don't see your device? Check endoflife.date directly →".

---

## Data

### In-scope endoflife products

Devices (`category: "device"`):

- `iphone`, `ipad`, `apple-watch`
- `pixel`, `pixel-watch`
- `samsung-mobile`, `samsung-galaxy-tab`, `samsung-galaxy-watch`
- `motorola-mobility`, `oneplus`, `nokia`

Operating systems (`category: "os"`):

- `ios`, `ipados`, `macos`, `android`, `windows`

**Excluded by design:** Linux distros, server/dev tooling, and everything outside the catalog above. The fetch script has an explicit allowlist; if endoflife adds a new device family we want, we add it to the allowlist and redeploy.

### Macs (special case — we fill an endoflife gap)

endoflife.date does not have a `macbook`/`imac`/`mac-mini` product because Apple never publishes per-Mac end-of-support dates. Instead, each new macOS version silently drops some older Macs. We solve this with a small hand-curated mapping and the existing `macos` data.

**`data/mac-compatibility.json`** — committed to the repo, manually maintained:

```jsonc
{
  "schemaVersion": 1,
  "lastVerified": "2026-04-15",
  "source": "https://www.apple.com/macos/macos-26/compatibility/",
  "models": [
    {
      "id": "macbook-pro-14-2021",
      "label": "MacBook Pro 14-inch (2021, M1 Pro/Max)",
      "family": "macbook-pro",
      "releaseYear": 2021,
      "maxMacOs": 26
    },
    {
      "id": "macbook-pro-2017",
      "label": "MacBook Pro (2017)",
      "family": "macbook-pro",
      "releaseYear": 2017,
      "maxMacOs": 13
    }
    // ~80 entries total, covering every Mac since ~2012
  ]
}
```

`maxMacOs` is the highest macOS major version that model can install. We then look up that version in the macOS endoflife data and use its `isEol` / `eolFrom` to answer the question.

**Result-screen logic for Macs:**

- "Your MacBook Pro 14-inch (2021) supports macOS up to 26 (Tahoe). macOS 26 still receives security updates until [date]. Latest version: 26.x.y."
- For an older Mac stuck on an EOL macOS: "Your MacBook Pro (2017) supports macOS up to 13 (Ventura). macOS 13 stopped receiving security updates in October 2025."

**Maintenance:** every September when Apple releases a new macOS, run `node scripts/check-mac-compat.mjs` (a small helper we'll write) which fetches Apple's compatibility page and diffs against our JSON, flagging changes for manual review. The diff is small (a few entries gain a `maxMacOs` bump; a few entries get newly-stuck on the previous version). Update in PR. Set `lastVerified` to the new date.

**Autocomplete:** Mac models appear in autocomplete just like other devices. Their `kind` is `device`, `family: "apple"`, `formFactor: "laptop"` (or `desktop` for iMac/mini/Studio/Pro). Search index includes `label` and common aliases (e.g., "MBP", "MacBook").

### Field mapping (endoflife → our snapshot)

We pull only what we use — keeps the snapshot small and auditable. From `GET /api/v1/products/{name}`:

**Per product:**
| Source | Snapshot field | Purpose |
|---|---|---|
| `name` | `id` | URL-safe identifier |
| `label` | `label` | Display name (e.g. "Apple iPhone") |
| `category` | `kind` (`device` \| `os`) | Drives result-screen logic |
| `tags` (filtered) | `family` (`apple` \| `google` \| `samsung` \| `microsoft` \| `motorola` \| `oneplus` \| `nokia`) | Drives icon + family filter |
| `tags` (filtered) | `formFactor` (`phone` \| `tablet` \| `watch` \| `os`) | Drives category pill |
| `links.html` | `endoflifeUrl` | "Source" link on result screen |
| `versionCommand` | `versionCommand` | Where present, shown verbatim as "How to check" hint (e.g. Pixel: "Settings → About Phone → Regulatory labels") |
| `aliases` | `aliases` | Searchable in autocomplete |
| `labels.eol` | `eolLabel` | Used to render context-sensitive copy (e.g. iPhone shows "Supported"; Pixel shows "Security Updates"; iOS shows "Security Support") |

**Per release** (filtered — drop pre-release entries with no `releaseDate`):

| Source | Snapshot field | Purpose |
|---|---|---|
| `name` | `id` | Release ID |
| `label` | `label` | Display name (e.g., "iPhone 12 Pro", "iOS 18", "Windows 11 24H2") |
| `releaseDate` | `releaseDate` | "Released X years ago" copy |
| `isEol` | `isEol` | **Primary red/green signal** |
| `eolFrom` | `eolFrom` | Date support ended (or ends, if future) |
| `isEoas` | `isEoas` | Optional secondary signal — "active support has ended but security updates continue until X" |
| `eoasFrom` | `eoasFrom` | Date active support ends |
| `isMaintained` | `isMaintained` | Tiebreaker when EOL fields are null |
| `latest.name` | `latestVersion` (OS only) | "Make sure you're on iOS 26.4.2" |
| `latest.date` | `latestVersionDate` (OS only) | Recency hint |
| `latest.link` | `latestVersionLink` (OS only) | Link to release notes |
| `custom.supportedIosVersions` / `supportedIpadOsVersions` / `supportedWatchOsVersions` / `supportedAndroidVersions` | `supportedOsRange` (device only, where available) | Cross-reference: tells us the highest OS major this device can run, so we surface the right point release for older devices |

We do **not** ship: `identifiers`, `links.icon`, `links.releasePolicy`, `codename`, `isLts`, `discontinuedFrom`, full descriptive prose. (`isDiscontinued` is meaningless for security — Apple discontinues a model years before security updates stop.)

**`supportedOsRange` availability** (used for cross-reference in the device green result):

| Product | Has `supportedOsRange`? | Cross-reference target |
|---|---|---|
| `iphone` | ✓ | `ios` |
| `ipad` | ✓ | `ipados` |
| `apple-watch` | ✓ | `watchos` (not currently in snapshot — see open questions) |
| `pixel` | ✓ | `android` |
| `pixel-watch` | ✓ | `android` |
| `oneplus` | partial (OxygenOS, not Android) | n/a — no matching endoflife product, fall back |
| `samsung-mobile` / `samsung-galaxy-tab` / `samsung-galaxy-watch` | ✗ | n/a — fall back |
| `motorola-mobility` | ✗ | n/a — fall back |
| `nokia` | ✗ | n/a — fall back |

When cross-reference data is missing, the result screen falls back to "show the family's latest OS version" (e.g., "Latest Android is 16 — make sure you're updated").

### Snapshot file shape

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-03T04:12:00Z",
  "source": "https://endoflife.date/api/v1/",
  "products": [
    {
      "id": "iphone",
      "label": "Apple iPhone",
      "kind": "device",
      "family": "apple",
      "formFactor": "phone",
      "endoflifeUrl": "https://endoflife.date/iphone",
      "eolLabel": "Supported",
      "aliases": [],
      "versionCommand": null,
      "releases": [
        {
          "id": "12-pro",
          "label": "iPhone 12 Pro",
          "releaseDate": "2020-10-23",
          "isEol": false,
          "eolFrom": null,
          "isEoas": false,
          "eoasFrom": null,
          "isMaintained": true,
          "supportedOsRange": "14 - 26"
        }
        // ...
      ]
    },
    {
      "id": "ios",
      "label": "Apple iOS",
      "kind": "os",
      "family": "apple",
      "formFactor": "os",
      "endoflifeUrl": "https://endoflife.date/ios",
      "eolLabel": "Security Support",
      "aliases": [],
      "versionCommand": null,
      "releases": [
        {
          "id": "26",
          "label": "iOS 26",
          "releaseDate": "2025-09-15",
          "isEol": false,
          "eolFrom": null,
          "isEoas": false,
          "eoasFrom": null,
          "isMaintained": true,
          "latestVersion": "26.4.2",
          "latestVersionDate": "2026-04-22",
          "latestVersionLink": "https://developer.apple.com/documentation/..."
        }
        // ...
      ]
    }
  ]
}
```

Estimated size: ~14 products × ~20 releases × ~250 bytes ≈ **70-100 KB uncompressed**, ~15-25 KB gzipped. Acceptable to ship to the client in full for fuzzy matching.

---

## Backend

### Endpoint (Fastify)

`GET /api/v1/eol-snapshot` on the existing Fastify API (`api/`).

- Reads the latest snapshot JSON from disk.
- Sets `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
- Sets `ETag` based on `generatedAt`.
- On bootstrap failure (file missing), returns 503 with a JSON error. No cron, no fallback to live fetch — that would put endoflife in our hot path on every request.

The page lazy-loads from this URL. CORS already allows the production origin and `localhost:3000`.

### Daily refresh

A standalone Node script: `scripts/fetch-endoflife-snapshot.mjs`.

**What it does:**

1. Fetches `GET https://endoflife.date/api/v1/products/` to validate the catalog.
2. For each product in the allowlist, fetches `GET https://endoflife.date/api/v1/products/{name}`.
3. Maps fields into the snapshot shape above.
4. Writes atomically: write to `<path>.tmp`, then `rename`. Path is configurable via `EOL_SNAPSHOT_PATH` env var; default in dev is `data/eol-snapshot.json`, default in prod is read from a known location the Fastify API serves from.
5. On success, pings `process.env.HEALTHCHECK_EOL_PING_URL` (env var). On failure, pings `${url}/fail` (Healthchecks.io convention) with the error in the body. If the var is unset, skip the ping silently — useful in dev.

**Failure handling:**

- Per-product fetch failure → log, skip that product, keep the previous version of that product from the existing snapshot if available, continue. Aborting the whole run because one product 404'd would leave us with stale-everything.
- If 3+ products fail, abort and ping `/fail` — something systemic is wrong.
- If the catalog endpoint is down entirely, abort with `/fail`.
- Honor a 10-second per-request timeout. Total run should finish in < 30 seconds.
- Send a `User-Agent` header identifying us (e.g., `ActivistChecklist/1.0 (+https://activistchecklist.org)`) — endoflife is a free public service, be a good citizen.

**Build-time:**

The script also runs in `prebuild` so static deploys ship with a fresh snapshot. (`prebuild` already exists; we add this to the chain.) If endoflife is reachable, the build embeds today's snapshot; if not, the previous one is preserved.

**Cron schedule:**

- Daily, off-peak (e.g., 04:30 UTC).
- Implementation: a separate pm2 process `ac-eol-cron` (added to `ecosystem.config.js`) that uses `node-cron` to run the fetch script. We don't want to use `cron_restart` on the API process — that conflates restart and refresh. A dedicated cron app is cleaner.
- Alternative if the deploy doesn't keep a long-running process: a GitHub Action on a `schedule:` trigger that runs the script and commits the snapshot to a `data/` path the build picks up. Pick at implementation time based on actual deploy target.

### Healthcheck env var

```
# Healthchecks.io ping URL for the daily endoflife snapshot refresh.
# Empty in dev — script will skip pinging.
HEALTHCHECK_EOL_PING_URL=
```

Add to `.env.template` and `scripts/deploy-secrets.sh` (already exists).

---

## Frontend

### Components

```
app/[locale]/updates/page.tsx          # Server component — shell, metadata, SEO
components/Updates/
  UpdatesPage.tsx                      # Client component — orchestrates state
  FamilyButtons.tsx                    # Apple / Android / Windows / Other cards
  FamilyModal.tsx                      # "How to find your model" guide
  DeviceSearchInput.tsx                # Combobox with fuse.js autocomplete
  ResultCard.tsx                       # Big red/green answer surface
  ResultDeviceUpToDate.tsx             # Variant: device still supported
  ResultDeviceOutOfDate.tsx            # Variant: device EOL
  ResultOsUpToDate.tsx                 # Variant: OS still supported
  ResultOsOutOfDate.tsx                # Variant: OS EOL
  ResetButton.tsx
hooks/
  useEolSnapshot.ts                    # SWR-style fetch + parse + memoize
  useDeviceSearch.ts                   # Wraps fuse.js index
```

### Data loading

- Page mounts → `useEolSnapshot()` fetches `/api/v1/eol-snapshot` once and caches in module scope (in-memory). Subsequent navigations reuse the cached object.
- Loading state: skeleton in the input area, disabled family buttons, "Loading device list…" caption.
- On HTTP error or stale data (>14 days old), show a non-blocking warning banner: "Our device list may be out of date — last updated X. [Check endoflife.date directly]". Still allow the user to search.

### Result-screen logic

The crucial bit. There are four primary result variants.

There are five primary result variants:

- **A. Device — supported** (green)
- **B. Device — EOL** (red)
- **C. Device — uncertain** (yellow, only when both `eolFrom` is null AND `isMaintained` is `true` AND the device is moderately old)
- **D. OS — supported** (green)
- **E. OS — EOL** (red)

Each variant always includes a "Check another device" reset button and a "Source: endoflife.date" link to the product's page.

### Decision tree (device kind)

The primary question is binary: **is this device currently receiving security updates?** Future end-dates are secondary information, shown as a small detail when available, never as the headline.

Run these checks in order. First match wins:

1. **`eolFrom` is set and in the past** → **B (red)**. Definitive EOL.
2. **`isMaintained === false`** → **B (red)**. Manufacturer no longer maintains it. Copy: "Manufacturer has stopped issuing security updates."
3. **`eoasFrom` is set and in the past, `eolFrom` is null** → **B (red)**. Active support has ended; security updates almost certainly have too. (Catches a small slice of older Android devices.)
4. **`eolFrom` is set and in the future** → **A (green)**. Currently maintained. Optionally show "expected through {date}" as small subtext.
5. **`isMaintained === true`, no `eolFrom`** (covers all the "we don't know when it ends, but it's currently maintained" cases) → **A (green)**. Lead with the binary "yes." Don't burden the user with future-uncertainty.
6. **Edge case: no `eolFrom`, no `isMaintained` flag at all, `releaseDate ≥ 6 years` ago** → **B (red)** via age heuristic. Copy: "Released N years ago. No published end-of-support date and the manufacturer doesn't appear to be issuing updates."
7. **Edge case: `releaseDate` 3-6 years ago, no signals** → **C (yellow)**. The truly ambiguous case — point them at the manufacturer.
8. **Edge case: `releaseDate < 3 years` ago, no signals** → **A (green)** with caveat.

In practice rules 1, 2, and 4-5 cover essentially everything. Rules 3, 6-8 are safety nets.

**Coverage by brand using this tree:**

| Brand | Definitive (rules 1-5) | Heuristic / yellow (rules 6-8) |
|---|---|---|
| Pixel | 100% | 0 |
| Motorola | 100% | 0 |
| OnePlus | 100% | 0 |
| Nokia | 100% | 0 |
| Samsung Mobile | ~99% (243 dated + 161 unmaintained + ~30 with `isMaintained: true`) | <1% |
| Samsung Galaxy Tab | ~99% | <1% |
| Samsung Galaxy Watch | ~100% (all 13 fall under rules 2 or 5) | 0 |

For Samsung specifically: under rule 5, a device with `isMaintained: true` and no `eolFrom` is shown as **green with no caveat** about an unknown end date. That matches the "tell me if it's getting updates, don't make me think about future support" framing.

For yellow (rule 7) results, link the manufacturer's support page:

- Samsung: https://security.samsungmobile.com/workScope.smsb
- Google Pixel: https://support.google.com/pixelphone/answer/4457705
- Motorola: https://en-us.support.motorola.com/app/software-security-update
- OnePlus: https://community.oneplus.com (no stable URL — confirm at content review)
- Nokia: https://www.nokia.com/phones/en_int/security-updates

#### A. Device — supported (green)

Triggered by decision-tree rules 4, 5, or 8 (see below).

- Big green check icon. **"Your iPhone 12 Pro is still receiving security updates."** Lead with the binary.
- Optional subtext (small, secondary), only when relevant:
  - `eolFrom` set in future: "Updates expected through March 2031."
  - `eolFrom` null and `releaseDate < 3 years` and no `isMaintained` flag (rule 8): "End-of-support date not yet announced."
  - Otherwise (most green cases): no future-date subtext at all.

**Latest OS reminder block (always shown for device results):**

This is where we tell the user what version they should actually be on. Logic depends on whether the device has a `supportedOsRange` field:

**Case 1 — Device has `supportedOsRange` (iPhone, iPad, Apple Watch, Pixel, Pixel Watch):**

1. Parse the range (e.g., `"14 - 26"` → max = 26). Single-value ranges (`"26"`) are also valid.
2. Look up that major version in the family's OS product (e.g., `ios`).
3. Read its `latestVersion` field (e.g., `"26.4.2"` for iOS 26, or `"16.7.15"` for iOS 16).
4. Show: **"Make sure you're running iOS 26.4.2."** plus the Settings path.

This is the key win for older-but-still-supported devices: an iPhone 8 that maxes out at iOS 16 shows **"Make sure you're running iOS 16.7.15"** — the actual latest point release that user can install — instead of "iOS 26.4.2" which they can't.

**Sub-case: device max OS major < family's latest OS major**

When the device's max supported OS is older than the family's current major (e.g., iPhone 8 max = iOS 16, but the latest iOS is 26), append a soft warning **inside the green box**. This is still a green result — the device is currently maintained — but the user should know their security-update runway is shorter than someone on a newer device.

Comparison: `device.supportedOsRange.max < familyOs.latestRelease.id` (numeric compare, e.g., `16 < 26`).

Copy direction (still green, secondary tone, not a separate alert):
> "Your iPhone 8 only supports iOS 16. Apple will end security updates for iOS 16 before iOS 26 — newer iPhones will keep getting patches longer. If long-term security matters for your work, plan a hardware upgrade."

Optional precision: if iOS 16 has an `eolFrom` date set (which older majors usually do), show it: "iOS 16 is expected to lose security updates around {eolFrom}." Don't show this if the date is null — silent is better than vague.

For devices where `device.supportedOsRange.max === familyOs.latestRelease.id` (the device CAN run the latest major), no warning. The standard "make sure you're on iOS 26.4.2" copy already nudges them.

**Edge case: the device's max OS is itself EOL.** Rare but possible — endoflife marks an iOS major as `isEol: true` while the device is still maintained at the device level (Apple sometimes keeps issuing patches for older majors on older hardware after the major is officially "EOL" for newer devices). In that case the warning becomes stronger — copy direction:
> "Your iPhone 8 tops out at iOS 16, which Apple has officially ended support for. You may still receive occasional security patches, but treat this device as low-trust for sensitive work and plan to replace it."

This sub-case stays green at the headline (the device-level signal is still green), but the warning is the dominant copy in the result card.

**Case 2 — No `supportedOsRange` (Samsung, Motorola, Nokia):**

Fall back to the family's overall latest OS version: "Make sure you're running the latest Android (currently Android 16). Check **Settings → System → Software update**."

**Case 3 — OnePlus:**

OnePlus exposes `supportedOxygenOSVersions` rather than Android versions, and OxygenOS isn't an endoflife product. Skip the version-specific reminder; show only: "Make sure your phone is fully updated. **Settings → System → System updates**."

**Watches:** skip the OS reminder entirely. Users update watches via the paired phone; there's no clean OS to point at, and the device-level answer is the actionable one.

**Settings paths** are a small static map (Apple iOS, Apple iPadOS, Apple macOS, Android — most common path; we don't promise it works on every Android skin).

CTA: "Read our **digital security essentials** →" linking to the essentials guide.

#### B. Device — EOL (red)

Triggered when `isEol === true`, OR when `eolFrom` is null and `releaseDate ≥ 6 years` ago (heuristic — the device is old enough that lack of an announced date almost certainly means support has ended).

- Big red X icon. "Your **iPhone 7** is no longer receiving security updates."
- Sub-line if `isEol === true`: "Security support ended **3 years ago** (March 2023)."
- Sub-line for the heuristic case: "End-of-support date not announced, but devices this old typically no longer receive security updates. Yours was released **8 years ago**."
- Threat-model paragraph:
  > Phones that no longer receive security updates accumulate publicly known vulnerabilities. That raises the risk if your device is seized at a border, taken by police, or targeted with spyware.
- Recommendation: "Consider upgrading to a supported device. Until then, treat this phone as low-trust for sensitive work."
- CTAs:
  - Primary: "Read our **digital security essentials** →"
  - Secondary: "**Security essentials checklist** →"

#### C. Device — uncertain (yellow)

Triggered when `eolFrom` is null and `releaseDate` is between 3 and 6 years ago. Common for older Samsung, Motorola, OnePlus, and Nokia devices.

- Yellow/amber warning icon. "We can't confirm whether your **{device}** is still receiving security updates."
- Sub-line: "Released **{N} years ago**. Manufacturer hasn't published an end-of-support date, and devices this old may or may not be receiving updates."
- Recommendation: "Check the manufacturer's support page directly." Link to the manufacturer where we know the URL (Samsung, Google, Motorola, OnePlus, Nokia all have one).
- Show the latest-OS reminder block (same as A) — if their device IS still supported, an OS update is the action they should take.
- Soft threat-model note: "Until you confirm, treat this device as potentially out-of-date for sensitive work."
- CTA: essentials guide.

#### D. OS — supported (green)

Triggered when the user picks an OS release directly (e.g., "iOS 18", "Windows 11 24H2") and the OS is still receiving security updates (`isEol === false`).

- Big green check icon. **"iOS 18 is still receiving security updates."**
- "Latest version: **18.7.8**." Small subtext, primary actionable info.
- "Check yours at **Settings → General → About → Software Version**." (Family-specific.)
- Optional subtext, only if `isEoas === true && isEol === false`: "Apple has moved to security-only updates. Plan an upgrade to **iOS 26** when convenient." (No prominent end-date.)
- CTA: essentials guide.

**Note for Windows specifically:** since most Windows users land here via the OS button (not a device), the Windows result is more important than for other families. Show the Windows update path prominently: "Open **Settings → Windows Update** and click 'Check for updates'."

#### E. OS — EOL (red)

- Big red X icon. "**Windows 10** is no longer receiving security updates."
- "Support ended **October 2025**."
- Threat-model paragraph (same as B).
- Recommendation, family-specific:
  - **Windows:** "Upgrade to Windows 11. If your PC isn't compatible, plan a hardware replacement."
  - **macOS:** "Update to a newer macOS version, or replace the device if it can't run a supported version. Use this checker with your specific Mac model to see how high you can go."
  - **iOS / iPadOS:** "Update to the latest iOS, or replace the device if it can't run a supported version."
  - **Android:** "Update to a newer Android version if your device supports it, or replace the device."
- CTAs: essentials guide + security essentials checklist.

#### Special handling

- **Ambiguous user input.** "iPhone 12" matches both an `iphone` device release and the `ios` major version 12 (which is ancient). Always prefer device-level matches when both could fit; the autocomplete recency boost reinforces this since iPhone 12 (2020) ranks above iOS 12 (2018).
- **Dates in the future for `eolFrom`:** `isEol === false` but `eolFrom` is set — show "until {date}" alongside the green answer.
- **`isMaintained === false` with no `isEol`:** rare, but treat as red (the data implies it's EOL even if the explicit flag isn't set).
- **`isDiscontinued`:** ignored. Apple and others discontinue current models years before security updates stop.
- **Windows version subtleties:** Windows 11 has 23H2, 24H2, etc. as separate releases on endoflife. Autocomplete shows them separately and the recency boost surfaces 24H2 first. Result screen for an EOL feature update of an otherwise-supported Windows version: "Windows 11 23H2 reaches end-of-support October 2026 — update to 24H2 via Windows Update."

**Age heuristic constants** (tunable in one place):

```ts
const AGE_RECENT_YEARS = 3;   // < this and null eolFrom → green with caveat
const AGE_UNCERTAIN_YEARS = 6; // < this and null eolFrom → yellow; ≥ this → red
```

### Family modal copy outline

Each modal: a single illustrated path to find the model/version. Static content — no interactivity. Two-column on desktop, stacked on mobile. Image/illustration left, steps right.

- **Apple:** "Open **Settings → General → About**. Your model name (e.g. 'iPhone 12 Pro') is at the top. For Mac: click the Apple menu → **About This Mac**."
- **Android:** "Open **Settings → About phone** (or Settings → System → About phone). Your model name is listed there. To check your Android version: same screen, scroll to **Android version**."
- **Windows:** "Press **Windows key + R**, type `winver`, press Enter. The dialog shows your Windows version (e.g. 'Windows 11 24H2')."
- **Other:** Short note: "We currently support Apple, Google, Samsung, Motorola, OnePlus, and Nokia devices, plus iOS, iPadOS, macOS, Android, and Windows operating systems. For other devices (Linux laptops, niche Android brands, BlackBerry, etc.), check the manufacturer's support page or [endoflife.date](https://endoflife.date) directly."

---

## Content & i18n

- All UI strings go in `messages/en.json` under a new `updates.*` namespace.
- Product **labels** (e.g., "Apple iPhone", "Google Pixel") are passed through from endoflife verbatim and **not translated** — they are proper nouns.
- Per-family icons: Apple, Google, Samsung, Microsoft, Motorola, OnePlus, Nokia. Use `simple-icons` (already a transitive dep, or we add it).
- Result-screen copy uses ICU plurals for "X years ago" / "in X years".
- **No em-dashes** in MDX/static strings (per AGENTS.md). I've used hyphens above; will normalize on implementation.

---

## Analytics

- Track: family-button clicks, search submissions (with the matched product `id`, **not** the raw input — to avoid logging anything sensitive a user might mistype), result variant shown (A/B/C/D), CTA click-throughs.
- Use existing `/counter` endpoint pattern.
- Do not log the raw search string — we don't need it and it could contain device IMEIs or other identifiers if a user pastes wrong.

---

## SEO

- Page title: "Is your device still receiving security updates? — Activist Checklist"
- Meta description: "Check whether your phone, tablet, watch, or laptop is still getting security updates. Out-of-date devices are easier to compromise — here's what to do about it."
- OG image: generate via the existing OG pipeline.
- JSON-LD: `WebApplication` or `SoftwareApplication` with a description.

---

## Implementation phases

1. **Spec sign-off** (this doc).
2. **Snapshot fetcher** — `scripts/fetch-endoflife-snapshot.mjs` + `prebuild` hook + tests against fixture JSON. Writes a committed `data/eol-snapshot.fixture.json` for tests.
3. **Fastify endpoint** — `api/eol-snapshot.js`.
4. **Cron** — `ecosystem.config.js` entry + `scripts/eol-cron.mjs`. Add `HEALTHCHECK_EOL_PING_URL` to `.env.template`.
5. **Page shell + family buttons + modals** — non-interactive search.
6. **Autocomplete + result logic** — variants A/B/C/D, cross-reference table.
7. **Reset flow + URL state + a11y polish.**
8. **Copy review + i18n strings.**
9. **Analytics wiring.**
10. **OG image + sitemap + JSON-LD.**

---

## Open questions

1. **Cron host:** GitHub Action committing daily, or pm2-managed Node cron on the Fastify host? Decide at implementation time based on the production environment.
2. **Initial Mac compatibility seed:** writing the first ~80-entry `mac-compatibility.json` is a one-time chore. Pull from Apple's published macOS compatibility pages (most reliable) or Wikipedia's per-release tables (faster, equivalent). Verify by spot-check against Apple.
3. **Watches:** Apple Watch is checked at the device level (endoflife has `apple-watch`). Pixel Watch and Galaxy Watch have no clean OS to cross-reference and we skip the latest-OS reminder for those.
4. **Manufacturer support pages for the yellow "uncertain" state:** confirm the URLs we link to (Samsung, Google, Motorola, OnePlus, Nokia). Lock these in during content review.
