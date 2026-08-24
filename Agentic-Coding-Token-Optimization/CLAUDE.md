# CLAUDE.md

Guidance for working in this repo. Read `docs/PLAN.md` and `docs/TEMPLATE.md` before
research/authoring work.

## What this is

A research site + service playbook: **"Token Cost Optimization for Agentic Coding"** —
Part 2 of the Bonsai Labs research series (Part 1 = the parent `../` repo, whose deploy
workflow also publishes this site). Audience:
engineering leaders whose agentic-coding token spend keeps climbing without matching
results. **59 techniques** for cutting token cost without losing output quality, organized as
a maturity pyramid (**3 levels** — Hygiene / Engineering / Optimized) across **5 groups**
(Model Routing, Context, Caching, Workflow, Quality), plus **Foundations** (one-time setup —
measure spend, understand billing — shown as an overview, *not* technique pages). Static Astro
site. Internal Bonsai Labs research (access-controlled at deploy time via staticrypt).

## Architecture (how it fits together)

- **The content collection is the single source of truth.** Every technique is a file at
  `src/content/techniques/<group>/<slug>.md`; its `group` + `level` live in frontmatter.
  Unlike Part 1, there is **no** `taxonomy.mjs` technique list to keep in sync — the site
  derives groups/levels/counts by reading the collection.
- **`src/content.config.ts`** — Zod schema that validates every technique's frontmatter at
  build time. A bad field name or invalid enum **fails `npm run build`** (the metadata
  guardrail — lean on it). `appliesTo` accepts coding-harness keys *and* the eval-framework /
  benchmark keys the Quality group uses (langfuse, braintrust, harbor, hal, swe-bench*, …).
- **`src/data/taxonomy.mjs`** — display metadata only: the 3 `MATURITY_LEVELS`, the 5
  `GROUPS` (labels/blurbs), and `FOUNDATIONS` (the setup overview content).
- **Pages**: `src/pages/index.astro` (level/group overview), `techniques/index.astro`
  (grouped catalog), `techniques/[...slug].astro` (detail — routes by full `<group>/<slug>`),
  `foundations.astro`, and `tool-matrix.md` (generated from `docs/TOOL_MATRIX.md`).
- **Citations = GFM footnotes + structured `sources`, kept in sync.** Every inline `[^id]`
  has a `sources` entry with the same `id`; the detail layout renders `sources` as
  "References" and wires hover popovers (`src/scripts/citationPopover.ts`). Set `verify: true`
  on any practitioner/vendor-sourced headline number (renders a ⚠).
- **Body uses six fixed H2 headings** (see `docs/TEMPLATE.md`): `What & why`, `How to do it`,
  `When it's worth it / when not`, `What it costs you`, `How to verify`, `Measured impact`.
- **The tool matrix** (`docs/TOOL_MATRIX.md`) is the canonical per-tool "how"; the site page
  `src/pages/tool-matrix.md` is generated from it (regenerate if the matrix changes).

## Conventions that matter

- Routing is `/techniques/<group>/<slug>/` (namespaced by group) — don't flatten to bare slug.
- `savingBasis: measured` should only be set once a D3 benchmark arm backs the number; until
  then use `cited` or `estimate`. `Measured impact` blocks are placeholders until D3.
- Keep prose plain and short (reference, not persuasion). No per-item Foundations pages.

## Commands

```bash
npm run dev      # http://localhost:4321 (hot-reload)
npm run build    # static build to dist/ — ALSO validates all frontmatter
npm run preview  # serve the built site
npm run protect  # staticrypt-encrypt dist/ for access-controlled sharing
```

## Deploy

This project lives inside the `AI-Cost-Optimization` repo and is published by that repo's
`.github/workflows/deploy.yml` as a subpage of the same GitHub Pages site: on push to
`main` it builds both sites, merges this one's `dist/` into `dist/agentic-coding/`,
staticrypt-encrypts everything behind the shared `SITE_PASSWORD` secret, and deploys.
Live URL: `https://bonsai-labs-ai.github.io/AI-Cost-Optimization/agentic-coding/`
(base path applied automatically in CI by this project's `astro.config.mjs`).

## Regenerating the tool-matrix page

`src/pages/tool-matrix.md` is `docs/TOOL_MATRIX.md` with a layout frontmatter block prepended
and the internal working-note blockquote stripped. If the matrix changes, regenerate it (see
the node one-liner used to create it) rather than hand-editing both copies.

## Status

Catalog complete: **59 technique pages authored + QA'd + link-checked** (all sources resolve;
citations synced). Astro site scaffolded and building (63 pages). **Next:** D1 CTO playbook,
D3 benchmark (fills the `Measured impact` blocks and flips `savingBasis` to `measured`), and
optionally an interactive pyramid (currently a static level/group overview). Tracked in the
parent `AI-Cost-Optimization` git repo — don't commit unless asked.
