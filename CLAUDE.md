# CLAUDE.md

Guidance for working in this repo. Read `docs/RESEARCH_PLAN.md` and `docs/TEMPLATE.md`
before doing research/authoring work.

## What this is

A heavily-cited research documentation site: **"Cost Optimization for AI Products"**.
**73 techniques** to make AI products cheaper without losing quality, organized as a
**maturity pyramid** (3 levels, L0→L2) across **9 categories**. Static Astro site with an
interactive pyramid overview that zooms from a level into its techniques and out to each
technique's full detail page. Internal Bonsai Labs research.

> Restructured 2026-07-14: collapsed the original 5 levels → 3 (old L0+L1→L0, L2→L1,
> L3+L4→L2) and removed the `visibility-measurement` category and its 9 techniques.
> New distribution L0=14, L1=23, L2=36. This site is intended to become the first of
> several topic pyramids (planned: "AI SDLC", "Chat/Cowork").

Audience framing: a maturity model for *clients* — "where are you, what's the next win."

## Architecture (how it fits together)

- **`src/data/taxonomy.mjs` is the single source of truth.** It defines the 3
  `MATURITY_LEVELS`, the 9 `CATEGORIES`, and every technique (`TECHNIQUES_BY_CATEGORY`)
  with its slug + maturity level (confirmed in the review — see `docs/DECISIONS.md`).
  Plain `.mjs` so BOTH Astro (build) and the Node stub generator import it. Add new
  techniques here first, then `npm run gen:stubs`.
- **`src/content.config.ts`** — Zod schema that validates every technique's frontmatter at
  build time. A bad field name or invalid enum **fails `npm run build`** (this is our
  metadata guardrail — lean on it).
- **`src/content/techniques/<category>/<slug>.md`** — one file per technique. The `<slug>`
  must match the taxonomy. Frontmatter = metadata + structured `sources`; body = prose.
- **Pages**: `src/pages/index.astro` (pyramid), `techniques/index.astro` (category index),
  `techniques/[...slug].astro` (detail; routes by full `<category>/<slug>` id).
- **`src/components/Pyramid.astro`** — the interactive island. Data is serialized into a
  `<script type="application/json" id="pyramid-data">`; a vanilla `<script>` (TS, bundled
  by Astro) reads it and handles click/filter. No UI framework — keep it vanilla.
- **`scripts/generate-stubs.mjs`** — creates stub `.md` for any technique in the taxonomy
  that lacks a file. **Idempotent: never overwrites existing files.** Run after adding
  techniques to the taxonomy.

## Conventions that matter

- **Routing is `/techniques/<category>/<slug>/`** (namespaced by category) so duplicate
  leaf-slugs never collide — e.g. "pre-generation" exists in both `batching-async` and
  `product-ux`. Don't flatten to bare slug.
- **Citations = GFM footnotes + structured `sources`, kept in sync.** Every inline `[^id]`
  must have a `sources` entry with the same `id`, and every source should be cited. The
  layout renders `sources` as the "References" section. Prefer **primary sources** (provider
  docs, pricing, papers, official repos) for every quantitative claim; set `accessed:` dates.
- **Maturity levels are provisional** (`maturityProvisional: true` on stubs). Confirm during
  research and set it `false`. Levels in the taxonomy are first-pass estimates.
- **Body uses fixed H2 headings**: `Overview`, `Detailed Approach & Techniques`,
  `Example Where It Works`, `Example Where It Would NOT Work` (see `docs/TEMPLATE.md`).
- **`status`** flows `planned → in-progress → researched → published`. Stubs are `planned`.
- Reference example to match for quality/citations:
  `src/content/techniques/caching-reuse/prompt-caching-prefix-caching.md` (only fully-done one).

## Commands

```bash
npm run dev          # http://localhost:4321 (hot-reload)
npm run build        # static build to dist/ — ALSO validates all frontmatter
npm run preview      # serve the built site
npm run gen:stubs    # create stub files for new taxonomy entries
node scripts/generate-stubs.mjs --report   # list techniques still missing a file
```

## Environment / gotchas

- Windows + PowerShell primary; Bash (Git Bash) also available. **Node's `/tmp` resolves to
  `C:\tmp`, but Git Bash `/tmp` does not** — when piping files between `curl` (bash) and
  `node`, use absolute scratchpad paths, not `/tmp`.
- Astro 5.x is pinned; ignore the dev-server prompt to upgrade to Astro 7.
- The pyramid interaction is vanilla JS in `Pyramid.astro`. To debug it headlessly,
  `linkedom` works (jsdom hits a Node 22 `ERR_REQUIRE_ESM` with its CSS dep); load the
  served HTML + the bundled script and dispatch a click. (This is how a hidden-panel bug
  was found: the handler ran and populated the list but `detail.hidden` was never reset to
  `false` on select.)
- Not a git repo yet. Don't commit/push unless asked.

## Current status

Scaffold complete; pyramid + pages working. **Catalog reviewed & finalized in two passes:**
124 → 76 (round-1 fine-grained review) → **82 techniques across 10 categories** (round-2
per-category deep-research validation). infra-serving cut as out-of-scope; many merges/
re-tiers/adds. Full decision record in `docs/DECISIONS.md` (round-1 + the "DEEP-RESEARCH
VALIDATION PASS" section); research findings in `docs/TECHNIQUE_REVIEW.md`. Level
distribution L0=4, L1=14, L2=27, L3=28, L4=9. **ALL FOUR WAVES DONE: 82 of 82 techniques
researched & published — the catalog is complete (0 stubs).** Wave 1 (18 L0+L1), Wave 2 (27 L2),
Wave 3 (28 L3), Wave 4 (9 L4) — each authored one-general-purpose-subagent-per-technique against
`docs/WAVE{1,2,3,4}_BRIEFS.md`, each page with 5–10 WebFetch-verified primary sources and clean
footnote/source citation sync, validated by a full `npm run build` (84 pages) + a citation-sync
script + spot-checks of flagged/future-dated URLs. The **prompt-caching MUST-FIX is CLOSED**
(OpenAI cached-input corrected 50%→~90% against OpenAI's live pricing docs; ProjectDiscovery
7.6%→84.3% case study added; Anthropic multipliers re-verified).
Freshness fixes applied during authoring: `model-routing/reasoning-token-budgeting` documents
Gemini's current `thinking_level` interface (older integer `thinkingBudget` page retired); the
fine-tuning pages carry the OpenAI-self-serve-FT-wind-down caveat (May 2026→Jan 2027);
`agent-workflow/programmatic-tool-calling` frames the PTC timeline honestly (beta Nov 2025,
dynamic-filtering GA Feb 2026) rather than a flat "GA Feb 2026". Two figures softened at the gate:
`agent-workflow/workflow-decomposition` dropped an unconfirmable "61–94% of agentic cost" precise
band to the defensible qualitative claim (source kept); several agents self-corrected inflated
headline numbers (S-LoRA 30×→4×, LLMLingua 20×→2–10×). **Next: maintenance only** — prices/limits
drift (revisit caching/batching/routing/model-choice pages periodically per `accessed:` dates), and
re-grade tiers as the field matures. Nothing has been committed since the initial two commits.
Process that worked (all 4 waves): write a full brief per technique in a `docs/WAVE*_BRIEFS.md`, then
one general-purpose subagent per technique (reads its brief + `docs/TEMPLATE.md` + the reference
page, deep-researches, WebFetch-verifies every URL, writes the .md directly, sets `status:
published` + `maturityProvisional: false`), then a clean rebuild + citation/URL validation gate. Run
subagents in concurrency-capped batches (~9–10) — session limits killed a few mid-run and their
untouched stubs had to be detected (grep `status: planned` + line count) and re-launched.

When applying future catalog changes: edit `taxonomy.mjs`, then either
`node scripts/reconcile-content.mjs` (deletes orphaned/removed files) or — after re-tiering/
renaming — `node scripts/resync-stubs.mjs` (deletes planned stubs so they regenerate with
current levels), then `npm run gen:stubs`, then `npm run build`. The DECISIONS.md ledger
also holds per-technique 2026 freshness/body notes to apply during research.
