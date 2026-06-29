# Cost Optimization for AI Products — research site

An in-depth, heavily-cited research documentation site cataloguing techniques to make AI
products cheaper without sacrificing quality. Techniques are organized as a **maturity
pyramid** (5 levels, L0→L4) across **10 categories**, with an interactive overview that
zooms from a level into its techniques and out to each technique's full detail page.

Built with [Astro](https://astro.build) — static output, no server required.

## Quick start

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static site → dist/
```

## How it's organized

```
src/
  data/taxonomy.mjs            # SINGLE SOURCE OF TRUTH: levels, categories, techniques
  content.config.ts            # frontmatter schema (validates every technique at build)
  content/techniques/<category>/<slug>.md   # one file per technique
  components/Pyramid.astro      # the interactive maturity pyramid (homepage)
  pages/
    index.astro                 # pyramid overview
    techniques/index.astro      # all techniques, grouped by category
    techniques/[...slug].astro  # individual technique page
scripts/generate-stubs.mjs     # creates stub .md files for new techniques (idempotent)
docs/
  RESEARCH_PLAN.md             # how we research each technique (read this next)
  TEMPLATE.md                  # how to author a technique file
initial_idea.md                # the original brief
```

## Status

- ✅ Full scaffold: interactive pyramid, technique pages, category index.
- ✅ Catalog reviewed & finalized in two passes (fine-grained review + per-category deep research): **82 techniques across 10 categories** (see [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/TECHNIQUE_REVIEW.md`](docs/TECHNIQUE_REVIEW.md)).
- ✅ **Wave 1 researched & published: 18 of 82** — all L0+L1 foundation techniques (briefs in [`docs/WAVE1_BRIEFS.md`](docs/WAVE1_BRIEFS.md)).
- ⏳ Remaining 64 techniques to research (Wave 2 = L2) — see [`docs/RESEARCH_PLAN.md`](docs/RESEARCH_PLAN.md).
- ⚠️ Open: the Prompt Caching page's OpenAI cached-input figure needs a freshness fix (50%→~90%) — see DECISIONS.md.

## Adding / editing techniques

1. Edit the file at `src/content/techniques/<category>/<slug>.md` (see `docs/TEMPLATE.md`).
2. To add a *new* technique, add it to `src/data/taxonomy.mjs` then `npm run gen:stubs`.
3. `npm run build` validates all frontmatter — a green build means metadata is well-formed.
