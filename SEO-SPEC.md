# SEO Improvements — Implementation Spec

Working doc for the single-pass SEO improvement implementation. Not meant to live in the repo long-term.

---

## Rewrite prompts (use these to redo meta descriptions + answer capsules)

The first-pass meta descriptions and answer capsules were too shallow. Two reasons: (1) I drafted from the guide MDX alone, but the guide MDX is mostly scaffolding — `<ChecklistItem slug="…" />` references resolve to separate files in `content/en/checklist-items/`, so a guide can have 17 substantive items while its raw MDX has 30 lines of intro. Without reading the items, the descriptions over-index on intro text and the capsules under-represent the guide. (2) I wrote feature-list descriptions ("PIN, safety numbers, disappearing messages, notification previews") instead of answers to the implicit search query.

Both prompts below are designed to be invoked verbatim per page. They include the reading workflow (so the next pass is grounded in the whole page), the project voice rules, and the failure modes I want to avoid.

### Prompt: SEO meta description (140-160 chars, all guides + pages)

```
Write a meta description for [content/en/{guides|pages}/{slug}.mdx] on Activist
Checklist, a free plain-language digital security resource for activists and
organizers.

BEFORE WRITING — read the whole page, not just the MDX shell.

1. Read content/en/{guides|pages}/{slug}.mdx in full.
2. Grep the body for every `<ChecklistItem slug="..." />`. For each one, read
   content/en/checklist-items/{item}.mdx. The guide MDX is mostly intro +
   scaffolding; the substantive content lives in the items. Skipping this step
   produces a description that only reflects the intro.
3. Note the audience stated at the top of the guide, the named threats, the
   risk-level sections (everyone / medium / high), and any time estimates.
4. Identify the implicit search query — the question someone would type into
   Google or ask ChatGPT when this page is the right answer. Examples:
   "how do I make Signal secure for activism", "can I bring my phone to a
   protest", "what to do if I'm doxxed", "what does ICE see when they search
   my phone".

VOICE AND STYLE (project rules):
- Plain language, 8th-grade reading level. US English.
- Opinionated and concrete. Skip marketing words: discover, unlock, empower,
  ultimate, complete, transform, "in today's world", "essential guide".
- Lead with what the reader will do or learn, not who we are.
- Honest about tradeoffs. No hype, fake urgency, or clickbait.
- NO em-dashes. Use commas, periods, semicolons, or colons. This is a hard
  project rule and applies even when the em-dash would be grammatically nicer.
- No emojis, no surrounding quote marks, no trailing ellipsis.

SPEAK TO THE READER'S VALUES (this is the meta-rule for click-through):

The site is for activists, organizers, and people who already know the
political stakes. The reader is not neutral and the threats are not abstract.
The goal is to increase click-through, and the way to do that is to speak to
the reader's beliefs and values, in addition to answering their question.
A description that names the actual adversary signals "this is for you" and
earns the click. A sanitized description ("protect yourself online") reads
like advice from a privacy newsletter.

Concrete moves (use when relevant to the page, not in every description):
- Name the actual adversary when it's central: ICE, CBP, DHS, the federal
  government, the administration, the Trump administration, the police, FBI
  surveillance, Canary Mission, right-wing doxxing, the authoritarian turn,
  DOGE, agency rollbacks, Palantir, Clearview, Cellebrite, GrayKey.
- Use words the reader uses: "activists", "organizers", "the movement",
  "comrades" when it fits naturally. Not "users".
- Acknowledge concrete stakes: "if your phone is seized", "if you're targeted",
  "if you're detained", "if ICE shows up". Concrete, not abstract.

When to do this:
- The page is explicitly about that adversary or threat.
- The reader would use that word in their search query ("ICE search phone",
  "doxxing defense activist", "what does DHS see on my phone").
- Naming makes the description more honest and more specific.

When NOT to do this:
- The threat isn't central to the page (don't shoehorn ICE into a generic
  Signal description; the threat there is broader phone-search surveillance).
- It would feel performative, sloganistic, or shoehorned.
- It would mislead about the actual scope of the guide.

The aggregate effect across the site should be: SERPs and AI answers convey
that this is a serious resource for people who already know what's at stake,
not a neutral privacy guide.

FORMAT:
- 140-160 characters including spaces. Hard ceiling 160. Aim 150.
- 1 to 2 sentences.
- Include the primary keyword naturally, ideally in the first half.
- Do not repeat the page title verbatim — the title already shows in SERP.
- If the description contains a colon, wrap the YAML value in double quotes:
    seoDescription: "Short answer: do this. Then the rest."
  Otherwise YAML parses it as a mapping and the build breaks.

CONTENT (this is where the first pass failed):
- Answer the implicit search query in the first 8 to 10 words.
- Name the specific threat or use case when it's central to the page: ICE
  encounter, protest, phone seizure, doxxing, border crossing, federal worker,
  Pegasus / Graphite spyware, Canary Mission, geofence warrant. Generic
  "protect yourself online" earns nothing.
- NO time estimates in descriptions ("in 45 minutes", "15 minutes"). The
  reader doesn't care from a SERP; they care whether this answers them.
- NO references to internal section structure ("baseline section", "enhanced
  section", "higher-risk sections"). Reader doesn't know what those are.
  Talk about audiences ("for organizers", "non-citizens") not page anatomy.
- "Step-by-step" is fine as a scope signal; "8 steps" or "17 settings" is
  not — feels overwhelming or SEO-stuffed.
- Do not write a feature list. "PIN, safety numbers, disappearing messages,
  notification previews" looks SEO-stuffed and answers nothing. A meta
  description full of nouns is worse than one with a single clear sentence
  that says what the reader gets.
- The reader should finish the description and know whether this page solves
  their problem.

PROCESS PER PAGE:
1. Draft 3 candidates with different angles (action-first, question-first,
   threat-first). Count chars on each.
2. Pick the strongest. If it's outside 140-160, revise it; do not pick a
   weaker option to hit length.
3. Return: the final description, the character count in brackets, and one
   sentence on why this angle.

ANTI-PATTERNS I have shipped before (do not repeat):
- "Lock down Signal in about 15 minutes. Registration PIN, safety numbers,
  disappearing messages, notification previews. Plain steps for activists."
  → feature list, doesn't answer anything, three sentences.
- "Digital security essentials for activists. Lock down your phone, messaging,
  and accounts in about 45 minutes. Plain-language steps, no jargon."
  → fine but generic; "essentials" / "lock down" are not what people search.
- "Protect your phone and laptop from Pegasus, Graphite, and other commercial
  spyware. Who is at risk, what works, and how to check for infection."
  → this one is OK; use it as a model.
```

### Prompt: Answer capsule (40-80 words, top guides)

```
Write an `answerCapsule` for [content/en/guides/{slug}.mdx] on Activist
Checklist. This is a 2-4 sentence paragraph rendered at the top of the guide
in a tinted card. It serves two audiences: a human who wants a TL;DR before
they commit, and an AI search engine (ChatGPT, Perplexity, Google AI Mode)
extracting a direct answer to a question about this topic.

BEFORE WRITING — read the whole page.

1. Read content/en/guides/{slug}.mdx in full.
2. Grep the body for every `<ChecklistItem slug="..." />`. For each one, read
   content/en/checklist-items/{item}.mdx. THIS IS NON-OPTIONAL. The guide MDX
   alone is the scaffold; the items are the substance. A capsule written from
   only the MDX shell undersells what the guide actually covers. The first-pass
   capsules were weak because I skipped this step.
3. Note: the explicit audience ("Who this checklist is for"), the named threats
   ("Phone seizure and searching", "Mapping activist networks", forensic
   extraction tools, ICE facial recognition, Canary Mission doxxing),
   the section structure (baseline / enhanced / high-profile), and the time
   estimate.
4. Identify the question the guide is answering. Not "what's in this guide"
   but "what should I do about X" or "how do I X". One sentence.

THE CAPSULE'S TWO JOBS:
1. Reader: in one paragraph, tell them what this guide concludes, who it's
   for, and roughly how it's structured, so they can decide whether to read on.
2. LLM: give a clean, quotable answer that stands alone when extracted out of
   context and shown as the answer to "should I bring my phone to a protest?"
   / "how do I make Signal secure?" / "what do I do if I'm doxxed?"

VOICE AND STYLE (project rules):
- Same Activist Checklist voice: plain, opinionated, concrete, honest about
  tradeoffs. 8th-grade reading level. US English.
- No marketing words, no hype, no urgency theater.
- NO em-dashes. Hard project rule.
- Speak to the reader directly ("you") where natural.

SPEAK TO THE READER'S VALUES (the meta-rule):

The site is for activists, organizers, and people who already know the
political stakes. The reader is not neutral and the threats are not abstract.
The goal of a capsule is to increase engagement and AI citation, and the way
to do that is to speak to the reader's beliefs and values, in addition to
answering their question. A capsule that names the actual adversary signals
"this is for you" to a reader and "this is a substantive answer about a real
political situation" to an AI engine. A sanitized capsule that says "protect
your communications" reads like generic privacy advice and gets quoted less.

Concrete moves (use when relevant to the page, not in every capsule):
- Name the actual adversary when central: ICE, CBP, DHS, the federal
  government, the administration, the Trump administration, the police, FBI
  surveillance, Canary Mission, right-wing doxxing, the authoritarian turn,
  DOGE, agency rollbacks, Palantir, Clearview, Cellebrite, GrayKey.
- Use words the reader uses: "activists", "organizers", "the movement",
  "comrades" when natural. Not "users".
- Acknowledge concrete stakes: "if your phone is seized at the border",
  "if ICE shows up at your door", "after a doxxing campaign", "if you're
  detained at a protest". Concrete, not abstract.

When to do this:
- The page is explicitly about that adversary or threat.
- The capsule is more honest and more specific because of it.
- The reader's implicit question already contains the adversary
  ("how do I prepare my phone for ICE encounters").

When NOT to do this:
- The threat isn't central to the page.
- It would feel performative or shoehorned.
- It would mislead about the actual scope of the guide.

Capsules that name the threat tend to be the strongest. Capsules that hedge
into neutrality tend to undersell the guide.

FORMAT:
- 40 to 80 words. Most should land 50 to 70.
- 2 to 4 sentences.
- Standalone. Reads correctly when quoted out of context.
- Do not start with "This guide..." or "In this checklist..." — start with the
  answer or the audience.
- YAML escaping: if the capsule contains a colon, either avoid the colon or
  use the folded block scalar (`answerCapsule: >`) the existing files use.

CONTENT (where the first pass failed):
- Lead with the actual answer, not the setup. Bad: "Heading to a protest? Here's
  what to do." Good: "Power your phone off before you go. Use a 6+ digit
  passcode, not biometrics. Turn on Signal disappearing messages."
- Reflect the WHOLE guide, not just one section. If the guide has baseline +
  enhanced + high-profile tiers, the capsule should acknowledge the range,
  but by AUDIENCE not by section name. Bad: "Baseline section is 15 minutes.
  Enhanced section for organizers." Good: "Organizers and people more likely
  to be targeted should go further."
- NO time estimates ("Most people finish in 15 minutes", "Baseline section is
  15-20 minutes"). Reader and AI engine both get more value from substance.
- NO references to internal section structure ("Baseline section", "Enhanced
  section", "higher-risk sections", "Sections below cover X"). Talk about
  who the deeper guidance is FOR, not where it lives on the page.
- "Step-by-step" is fine as a scope signal; specific step counts ("17
  settings", "8 steps") feel overwhelming.
- Name the audience: "for activists observing ICE", "before crossing the US
  border", "for federal workers resisting agency rollbacks". Vague capsules
  get pulled as vague AI answers.
- Name specific threats where central: forensic phone extraction, ICE facial
  recognition, Canary Mission, geofence warrants, Cellebrite, doxxing trucks.
  Specific entities increase AI citation rates.
- Name concrete tools where they belong: Signal, EasyOptOuts, Proton Mail,
  GrapheneOS, Lockdown Mode. Don't load every capsule with brand names, but
  one or two concrete tools beat a paragraph of abstractions.
- Acknowledge a real tradeoff when there is one. "Most secure option is not
  bringing the phone at all. If you must, here's what to do." That honesty
  is what makes the site useful and what gets quoted.

PROCESS PER GUIDE:
1. Pull from the source files: the stated audience, the threats, the section
   structure, the time estimate.
2. Write the one-sentence thesis ("how do I make Signal secure for activist
   use" → "Signal is secure if you do five things at the device level and one
   thing inside the app.").
3. Draft. Word count. Trim to 50-70.
4. Sanity check: if an AI pulled this paragraph out as the answer to the
   implicit question, would it stand alone and be true to the guide?

ANTI-PATTERNS I have shipped before (do not repeat):
- "To make Signal secure for activist use, set a registration PIN, turn on
  disappearing messages, verify safety numbers with close contacts, hide
  notification previews on the lock screen, and enable Always Relay Calls."
  → enumerates 5 specific steps from a 17-item guide. Misrepresents the
  breadth. Reads like a meta description that grew up.
- "Three questions to answer before you need this plan: who would you call..."
  → starts with a meta-frame ("three questions") instead of the answer.
- Tactical bullet-list capsules. They should read like the lead paragraph of
  a news article, not a checklist sub-item.
```

### Workflow when re-running these later

1. For each `{slug}`, build a "page brief" by reading the guide MDX and all referenced checklist items. Use ripgrep on the guide body to extract item slugs.
2. Draft `seoDescription` first (it's the easier shape), then the `answerCapsule` (it needs more synthesis).
3. After every batch, run `pnpm seo:audit` — it catches missing fields, wrong lengths, and duplicate descriptions.
4. Spot-check three pages: read each new description out loud, ask "does this answer the implicit search query?" If not, redraft.

---

## Scope summary

In scope this pass:
1. New frontmatter fields `seoTitle` / `seoDescription` wired into `generateMetadata`
2. Hand-rewritten `seoDescription` for all ~28 guides+pages in our voice
3. Hand-rewritten `seoTitle` for the 8 top guides (front-loaded keywords, year tag where applicable)
4. JSON-LD: `Article` on every content page; `Organization` + `WebSite` on home; `BreadcrumbList` on guide/page routes; `HowTo` on the 8 top guides; `FAQPage` only when a page has FAQ content
5. New `<FAQ>` MDX component that renders Q&A pairs and emits `FAQPage` JSON-LD
6. Draft 4–6 FAQ Q&As (in the MDX) for the top 3 guides for review
7. New `answerCapsule` frontmatter field, rendered as a styled intro block; drafts for all 8 top guides for review
8. Auto-generated `llms.txt` at build time, aggregating guides + pages + checklist items
9. `robots.txt` updated to explicitly allow major AI bots and disallow internal routes
10. Vitest coverage for any new pure logic (frontmatter resolution, llms.txt builder)

Spanish (`es/`) is covered for **infrastructure** (schema, llms.txt, robots, frontmatter shape) but Spanish-language `seoTitle`/`seoDescription`/`answerCapsule`/FAQ text will be left blank for Crowdin to translate.

Out of scope (Phase 2 list at bottom):
- Image alt-text audit
- New content articles (the 14 gap ideas)
- GSC/Bing Webmaster verification (user action)
- Backlink outreach (user action)
- City-specific guides (Phase 2)

---

## Top 8 guides (in user-stated popularity order)

1. `signal`
2. `essentials`
3. `travel`
4. `ice`
5. `protest`
6. `doxxing`
7. `secondary`
8. `emergency`

These are the targets for: `seoTitle`, `HowTo` schema, `answerCapsule` drafts. FAQ drafts hit the top 3 only (`signal`, `essentials`, `travel`).

---

## 1. Frontmatter additions

Three new optional fields added to guides and pages:

```yaml
seoTitle: "Signal Security Checklist for Activists (2026)"
seoDescription: "Lock down Signal in 15 minutes: registration PIN, safety numbers, disappearing messages, lock-screen previews. Plain-language steps, no jargon."
answerCapsule: >
  To make Signal secure for activist use, turn on disappearing messages,
  set a registration PIN, verify safety numbers with close contacts,
  hide notification previews, and enable Always Relay Calls. The
  checklist below walks through each.
```

**Resolution rules in `generateMetadata`:**
- `<title>` ← `frontmatter.seoTitle` if set, else `${frontmatter.title} | Digital Security Checklists for Activists`
- `<meta name="description">` ← `frontmatter.seoDescription` if set, else falls back to existing chain: `excerpt` → `summary` → `description` → `DEFAULT_DESCRIPTION`
- OG and Twitter `title`/`description` use the same resolved values
- `frontmatter.title` is **untouched** — still drives the H1 and existing UI

**Keystatic config:** add the three fields to `keystatic.config.tsx` for guides + pages so the Keystatic editor exposes them. Marked optional, with help text.

**Tests:**
- Add a vitest for the resolution chain (seoTitle/seoDescription precedence, fallbacks)

---

## 2. `seoTitle` rewrites (top 8 guides)

Draft titles (you'll review with the descriptions). Patterns: front-load the query, include "Activists" where natural, year-tag on evergreens.

| Slug | Current title | Proposed seoTitle |
|---|---|---|
| signal | Signal Security Checklist | `Signal Security Checklist for Activists (2026)` |
| essentials | Security Essentials | `Digital Security Essentials for Activists (2026)` |
| travel | (current) | `Travel Digital Security Checklist for Activists` |
| ice | (current) | `ICE Encounter Digital Security: Phone + Account Prep` |
| protest | (current) | `Protest Digital Security Checklist: Phone + Signal Prep` |
| doxxing | Doxxing Defense Checklist | `Doxxing Defense Checklist for Activists` |
| secondary | (current) | `Secondary Phone Setup for Protests and Actions` |
| emergency | (current) | `Emergency Digital Security: If Your Device Is Seized` |

(I'll confirm the current titles for travel/ice/protest/secondary/emergency at implementation time and adjust to avoid awkward duplication.)

---

## 3. `seoDescription` rewrites (all guides + pages)

Hand-written in voice per the prompt. Hard ceiling 160 chars; aim 140–160.

I'll batch these and put them inline as I add the frontmatter field — one commit-ready edit per file. The spec doesn't enumerate all 28 strings; I'll generate them during implementation following the prompt's voice rules. Review point: you'll see them all in one diff before commit.

---

## 4. `answerCapsule` drafts (top 8 guides)

40–60 word answer-first paragraph that directly answers the page's implicit question. Renders in the intro area of the guide, above existing body.

**UI rendering**: new component `<AnswerCapsule>` (or render inline in `Guide.js` when `frontmatter.answerCapsule` is set), styled as a quiet emphasis block. Not an `<Alert>`. Sits between the page title/meta block and the existing body intro.

I'll draft all 8 in this pass. You review the resulting MDX/frontmatter; if you don't like one, you can blank it or delete the field. If you keep them, they ship.

---

## 5. JSON-LD schema

### Where it lives
A new `lib/structured-data.js` (pure logic, vitest-tested) builds the JSON-LD objects from `frontmatter` + `slug` + `locale`. The slug page injects `<script type="application/ld+json">` in metadata via Next.js's `other` metadata isn't typed; we'll use a small server component `<JsonLd data={...}/>` rendered alongside the page, since static export inlines it into the HTML.

Each page emits a single combined `@graph` array (preferred by Google) containing all applicable types.

### Schema by page type

**Home (`/` and `/es/`):**
- `Organization` (name, url, logo, sameAs: bluesky, github, license link)
- `WebSite` (with `inLanguage` and `potentialAction` for site search if Pagefind exposes one; otherwise omit `potentialAction`)

**Every guide and page:**
- `Article` (headline, description, datePublished from `firstPublished`, dateModified from `lastUpdated`, image = OG image, inLanguage, license = CC BY-SA, isPartOf the WebSite, author = Organization)
- `BreadcrumbList` (Home → section → page)

**Top 8 guides only:**
- `HowTo` (name = title, description = seoDescription/excerpt, totalTime from `estimatedTime` if parseable, steps from `<ChecklistItem slug="..." />` references — **one HowToStep per ChecklistItem**, NOT per Section). Section is a category grouping, not a step. Each step's `name` = checklist-item title; `text` = first paragraph of the item body; `url` = `/guide-slug/#item-slug`. If extraction yields zero items for a guide, skip HowTo for that one.

**Any page with `<FAQ>` content:**
- `FAQPage` emitted by the FAQ component (see §6)

**News items, changelog:**
- `Article` with `datePublished` from frontmatter

### Tests
- `lib/structured-data.test.js` — covers Article from various frontmatter shapes, BreadcrumbList for nested vs. root, HowTo step extraction edge cases, omission rules (e.g., no `lastUpdated` → no `dateModified`)
- Schema is validated against Google's [Rich Results Test](https://search.google.com/test/rich-results) manually after deploy

---

## 6. `<FAQ>` MDX component + FAQPage schema

### Component
`components/guides/FAQ.js` — accepts children in this shape:

```mdx
<FAQ>
  <FAQItem question="Is Signal actually secure?">
    Yes. Signal uses end-to-end encryption that has been independently audited...
  </FAQItem>
  <FAQItem question="Can the government read my Signal messages?">
    No, not the message content...
  </FAQItem>
</FAQ>
```

Renders as a styled accordion (reusing `CollapsibleSection` patterns) under an H2 "Frequently asked questions". Component also collects the Q&A pairs and emits `FAQPage` JSON-LD inline.

Registered in `lib/mdx-components.js` and `lib/mdx-options.js`.

### Q&A drafts
I'll draft 4–6 Q&As for the top 3 guides:
- `signal`: e.g. "Is Signal actually secure?", "Can police read my Signal messages?", "Is Signal safer than WhatsApp?", "Do I need to verify safety numbers?"
- `essentials`: e.g. "How long does this take?", "Do I need new accounts?", "Is iPhone or Android better for activists?", "What if I can't do all of this?"
- `travel`: e.g. "Should I cross a border with my phone?", "Can CBP unlock my iPhone?", "What about a burner phone for travel?"

You review. If you keep them, they ship. If you don't, blank the FAQ blocks before merge.

---

## 7. `llms.txt` auto-generation

### What
A new script `scripts/build-llms-txt.cjs` runs as part of `next-sitemap`'s postbuild step (or as its own postbuild). Output: `public/llms.txt` (or written directly to `out/llms.txt`), one per locale (`/llms.txt` for en, `/es/llms.txt` for es).

### Format
[llms.txt convention](https://llmstxt.org/):

```
# Activist Checklist

> Plain-language digital security guides for activists and organizers. Free, CC BY-SA licensed, field-tested.

## Guides

- [Security Essentials](https://activistchecklist.org/essentials/): Lock down your phone, messaging, and accounts in about 45 minutes.
- [Signal Security Checklist](https://activistchecklist.org/signal/): Configure Signal to protect your messages and calls.
...

## Pages

- [Is Signal secure?](https://activistchecklist.org/signal-secure/): ...
...

## Checklist items

- [Add a security PIN to your bank and cell phone accounts](https://activistchecklist.org/essentials/#account-pin): ...
...
```

Checklist items are referenced under their parent guide's URL with a hash anchor. The script walks `content/en/guides`, `content/en/pages`, `content/en/checklist-items` and reads frontmatter. For checklist items, the script needs to know which guide each item belongs to — done by reverse-mapping from `<ChecklistItem slug="..." />` occurrences in guides (existing `extractChecklistItems` in `lib/content.js` already does this).

### Description source
- For guides/pages: `seoDescription` → `excerpt` → first 160 chars of body stripped of MDX
- For checklist items: first sentence of body, stripped

### Tests
- `__tests__/build-llms-txt.test.js` — covers the script's pure functions (frontmatter → entry, body → fallback description, guide → checklist-items reverse map)

---

## 8. `robots.txt`

Rewrite `public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /files/
Disallow: /keystatic
Disallow: /api/
Disallow: /preview

# Major AI crawlers — explicitly allowed.
# Site content is CC BY-SA 4.0; redistribution and AI ingestion are permitted.
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: https://activistchecklist.org/sitemap.xml
Sitemap: https://activistchecklist.org/llms.txt
```

(`llms.txt` isn't a sitemap, but no harm in advertising it; some crawlers do look here. Alternatively, drop the second Sitemap line if it triggers strict validators. I'll keep the `Sitemap:` directive only for `sitemap.xml` and put `llms.txt` discoverability in `<link rel="alternate">` in `<head>` instead. **Decision: only `sitemap.xml` in robots.txt; add `<link rel="alternate" type="text/llms.txt" href="/llms.txt">` to `<head>` for llms.txt discovery.**)

---

## 9. Sitemap

No changes needed — current `next-sitemap.config.js` already does content-date lastmod and hreflang alternates. Verify after build that new pages still appear.

---

## 9.5. Build-time SEO audit

A new script `scripts/seo-audit.cjs` runs as part of the build and prints a warning report for any guide/page missing required SEO info. Non-blocking by default; `--strict` flag (or `SEO_AUDIT_STRICT=1` env var) makes it exit non-zero, useful for CI.

### Rules

Per English guide/page (frontmatter):
- **Required (warn):** `seoDescription` present, 70–160 chars (the 70 floor catches placeholder one-liners)
- **Required (warn):** `firstPublished` and `lastUpdated` present and parseable
- **Required (warn):** `title` present (already true for everything; sanity check)

Per **top 8 guide** only (`signal`, `essentials`, `travel`, `ice`, `protest`, `doxxing`, `secondary`, `emergency`):
- **Recommended (warn):** `seoTitle` present
- **Recommended (warn):** `answerCapsule` present, 40–80 words

Per **top 3 guide** only (`signal`, `essentials`, `travel`):
- **Recommended (warn):** at least one `<FAQ>` block in the body

Cross-cutting:
- **Warn:** `seoDescription` exceeds 160 chars (hard ceiling from voice guide)
- **Warn:** `seoTitle` exceeds 60 chars (Google truncation threshold for most viewports)
- **Warn:** `seoDescription` is identical to another page's `seoDescription` (catches accidental duplicates)

Spanish (`es/`) content is **excluded** from the audit — those fields are Crowdin's responsibility and absence isn't a defect.

### Output

```
SEO audit
─────────
✓  18 pages clean
⚠  4 issues

  content/en/guides/research.mdx
    – seoDescription missing (falls back to excerpt: "...")
    – seoDescription should be 70–160 chars; excerpt is 42

  content/en/guides/signal.mdx
    – top-8 guide is missing answerCapsule

  content/en/pages/movies.mdx
    – seoDescription is 188 chars (hard ceiling 160)

  content/en/pages/onion.mdx
    – seoDescription duplicates content/en/pages/proton.mdx

Run with --strict to fail the build on warnings.
```

### Wiring

- Add `pnpm seo:audit` script in `package.json` that runs `node scripts/seo-audit.cjs`
- Add to the `build` script chain so it runs at build time (non-blocking): `... && node scripts/seo-audit.cjs || true` — or, better, have the script always exit 0 unless `--strict` is set, and just print to stderr
- Optional: add `pnpm seo:audit --strict` to a GitHub Action / Husky pre-push hook later (Phase 2)

### Tests

`__tests__/seo-audit.test.js` — covers the pure-logic rule evaluators (length checks, top-8 detection, duplicate detection) with fixture frontmatter objects. The file-walking layer is glue and skipped per the testing rules.

---

## 10. File-by-file change list

```
content/en/guides/*.mdx                       — add seoTitle (top 8) + seoDescription (all) + answerCapsule (top 8) + FAQ blocks (top 3)
content/en/pages/*.mdx                        — add seoDescription (all)
content/en/news/, content/en/changelog/       — no MDX changes this pass
content/es/                                   — leave seo* fields blank (Crowdin)

app/[locale]/[...slug]/page.tsx               — resolve seoTitle/seoDescription in generateMetadata; inject <JsonLd /> for Article + BreadcrumbList + HowTo
app/[locale]/page.tsx                         — inject Organization + WebSite JsonLd on home
app/[locale]/layout.tsx                       — add <link rel="alternate" type="text/llms.txt" href="/llms.txt"> in <head>

components/guides/FAQ.js                      — new FAQ component (renders accordion + emits FAQPage JSON-LD)
components/JsonLd.js                          — new tiny component for safe JSON-LD injection (escapes <, >, &)
components/AnswerCapsule.js                   — new component for answerCapsule frontmatter rendering
components/guides/Guide.js                    — render <AnswerCapsule> when frontmatter.answerCapsule is set

lib/mdx-components.js                         — register FAQ, FAQItem
lib/mdx-options.js                            — register FAQ, FAQItem in allowed list
lib/structured-data.js                        — new pure logic for building JSON-LD graphs
lib/content.js                                — no signature changes, but pass through new frontmatter fields

keystatic.config.tsx                          — add seoTitle, seoDescription, answerCapsule fields to guide + page collections

public/robots.txt                             — rewrite per §8

scripts/build-llms-txt.cjs                    — new build script
scripts/seo-audit.cjs                         — new build-time audit (warns on missing/over-length SEO fields)
package.json                                  — wire build-llms-txt + seo-audit into build/postbuild; add pnpm seo:audit script

__tests__/structured-data.test.js             — new
__tests__/build-llms-txt.test.js              — new
__tests__/seo-metadata-resolution.test.js     — new (covers seoTitle/seoDescription precedence)
__tests__/seo-audit.test.js                   — new (covers audit rule evaluators)
```

Estimated diff size: meaningful but bounded. The bulk of "lines changed" is meta description copy in 28 MDX files.

---

## 11. Validation plan

After implementation:
1. `pnpm test` — vitest pre-commit hook passes
2. `pnpm build` — static export still succeeds and the SEO audit prints a clean report (no warnings expected after the content edits in this pass)
3. `pnpm seo:audit --strict` — runs clean as a sanity check
4. Spot-check `out/index.html`, `out/signal/index.html`, `out/es/signal/index.html` for:
   - Resolved `<title>` and `<meta name="description">` match the new frontmatter
   - JSON-LD `<script>` tags present and JSON-parseable
5. Spot-check `out/llms.txt` exists, has all guides + pages + checklist items
6. Manually run a representative page through Google's Rich Results Test post-deploy (user action)

---

## 12. Commit/branch strategy

Per project rules: new branch `dev/seo-improvements` (or similar), no commits to main, no AI co-author. I'll prep the changes, run tests, and stage commits — you merge in GitHub.

Likely commit sequence:
1. Add seoTitle/seoDescription frontmatter + metadata resolution + tests
2. Add answerCapsule field + component + drafts for top 8
3. Add JsonLd component + structured-data lib + tests + wire into pages
4. Add FAQ component + register in MDX + drafts for top 3
5. Add build-llms-txt script + tests + wire into postbuild
6. Update robots.txt + add llms.txt link tag to layout
7. Update Keystatic config

---

## 13. Phase 2 list (not in this pass)

Captured here so we don't lose them:
- **Image alt-text audit** — sweep MDX for `<ImageEmbed>` / `<SimpleImage>` / `![]()` missing or weak alt text
- **GSC + Bing Webmaster Tools verification** — user action; add `<meta name="google-site-verification">` / `<meta name="msvalidate.01">` once tokens are in hand
- **Internal linking audit** — every guide should have a "Related guides" block with 3–5 sibling links; verify coverage
- **Content gap articles** — the 14 ideas from the research (Is Signal actually secure expansion, Can police unlock my iPhone, platform-specific data requests, FOIA guide, comparison posts, city-specific guides, etc.)
- **FAQ Q&As for guides 4–8** (ice, protest, doxxing, secondary, emergency) — same pattern as top 3
- **Section anchor IDs for long-tail SEO** — `/signal/#safety-numbers` etc., where they aren't already in place
- **AI citation tracking spreadsheet** — manual monthly run of 15 target queries through ChatGPT/Perplexity/Google AI Mode
- **Spanish copy review** — once Crowdin translates the new `seoTitle`/`seoDescription` fields, eyeball for quality
- **Backlink outreach** — Wikipedia external links, SURJ chapter pages, NLG chapters, 404 Media pitching

---

## Open questions before implementation

If any of these change the spec, flag now:
1. **`<AnswerCapsule>` styling**: is a quiet quote/emphasis block OK, or should it visually mirror `<Alert type="info">`? Default: quiet emphasis block (not an Alert).
2. **HowTo step extraction**: I'll parse `<Section title="...">` headings as step titles. If a guide has nested Sections or uses a different structure, I'll skip HowTo for that one rather than emit broken schema. OK?
3. **`llms.txt` checklist-item URLs**: they'll point at `parentGuideUrl#item-slug`. If a checklist item appears in multiple guides, I'll pick the first one (alphabetical) and note it once. OK?
4. **Keystatic field labels**: any wording preferences for the help text on the three new fields?
