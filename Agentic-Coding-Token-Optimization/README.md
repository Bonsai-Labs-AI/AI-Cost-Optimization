# Token Cost Optimization for Agentic Coding

Part 2 of the Bonsai Labs research series. A playbook for engineering leaders whose
agentic-coding token spend keeps climbing without matching results: **59 techniques** to cut
token cost without losing output quality, organized as a maturity pyramid (3 levels × 5 groups)
with a shared per-tool matrix across the major coding harnesses.

Static [Astro](https://astro.build) site. See [CLAUDE.md](./CLAUDE.md) for architecture and
[docs/PLAN.md](./docs/PLAN.md) for the project plan.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static build to dist/ (also validates every technique's frontmatter)
npm run preview  # serve the built site
```

## Structure

- `src/content/techniques/<group>/<slug>.md` — one file per technique (single source of truth).
- `src/content.config.ts` — frontmatter schema (build-time validation).
- `src/data/taxonomy.mjs` — levels, groups, and the Foundations overview content.
- `docs/` — plan, research findings, candidate list, page template, and the tool matrix.

Groups: Model Choice & Routing · Context Engineering · Caching · Workflow & Agent Loop ·
Quality & Evaluation. Levels: L1 Hygiene · L2 Engineering · L3 Optimized.
