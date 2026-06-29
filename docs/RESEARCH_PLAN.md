# Research plan — Cost Optimization for AI Products

This document defines **how** we research and write each of the ~124 techniques so the
output is consistent, deeply cited, and trustworthy. The site scaffolding, taxonomy, and
one fully-worked reference technique (`caching-reuse/prompt-caching-prefix-caching`) are
already in place. What remains is filling in the rest, one technique at a time.

---

## 1. Principles

1. **Primary sources first.** Provider docs, pricing pages, model cards, peer-reviewed or
   arXiv papers, and official repos beat blog posts. Every *quantitative* claim (a %, a
   price, a latency number, a benchmark) must trace to a primary source via a footnote.
2. **Citations are the product.** A technique page with weak citations is not "done."
   Target **5–10 quality sources** per technique. Use the structured `sources` frontmatter
   + matching GFM footnotes (see `docs/TEMPLATE.md`).
3. **Honest scorecards.** `effort`, `gain`, `riskToQuality`, and `maturityLevel` are
   judgement calls — but they must be *defensible from the body text*. If we rate gain
   "Very High," the body should show why with a concrete mechanism or number.
4. **Provisional until proven.** Levels in `taxonomy.mjs` are first-pass. When a technique
   is researched, confirm or change its level and set `maturityProvisional: false`.
5. **Vendor-neutral.** Cover the major providers (OpenAI, Anthropic, Google) and the
   self-hosted/open path (vLLM, SGLang, etc.) where relevant. Avoid recommending one vendor.

---

## 2. Per-technique research protocol

Run this loop for each technique. Budget ~30–60 min for simple Level 0–1 techniques and
up to a few hours for complex Level 3–4 ones.

### Step A — Frame (5 min)
- Restate the technique in one sentence and the **exact cost mechanism** it targets
  (input tokens? output tokens? number of calls? model unit price? GPU-hours?).
- Write the draft `shortDescription`.

### Step B — Source sweep (the bulk of the work)
Search in waves and collect URLs as you go:
1. **Official docs & pricing** for each relevant provider.
2. **Papers / benchmarks** (arXiv, vendor research, independent evals) for any technique
   with a quality/cost tradeoff (routing, distillation, compression, quantization, RAG).
3. **Reference implementations** (official SDK guides, vLLM/LangChain/LlamaIndex docs,
   well-known repos) for the "how."
4. **Real-world reports** (engineering blogs with numbers) for color and plausibility —
   but verify their claims against primaries.

> Tooling: use the `/deep-research` skill for a fan-out + adversarial-verify pass on
> hard techniques, or targeted `WebSearch`/`WebFetch` for quick ones. **Verify every URL
> resolves and set `accessed:` dates.**

### Step C — Adversarial check (10 min)
- For each headline number, ask: *source quality? still current? cherry-picked?*
- Find at least one **"where it would NOT work"** failure mode — every technique has one.
- Sanity-check the `maturityLevel`: does this technique require measurement, custom
  systems, or model training that implies a higher tier?

### Step D — Write
Fill the four body sections (`Overview`, `Detailed Approach & Techniques`,
`Example Where It Works`, `Example Where It Would NOT Work`) per `docs/TEMPLATE.md`.
Fill `detectionSignals`, `measurementMethods`, the scorecard, and `sources`.

### Step E — Finalize
- `status: published`, set `lastUpdated`, set `maturityProvisional: false`.
- Add `related:` cross-links (this is also how readers navigate between techniques).
- Run `npm run build` — frontmatter is schema-validated, so a green build means the
  metadata is well-formed.

### Definition of done (checklist)
- [ ] All four body sections written, with concrete detail (not generic).
- [ ] ≥5 quality sources, primary sources for every number, footnote ids = source ids.
- [ ] Scorecard + detection signals + measurement methods filled and defensible.
- [ ] Maturity level confirmed; `maturityProvisional: false`.
- [ ] `npm run build` passes; page reviewed in the browser.

---

## 3. Sequencing — what order to research

We research **by category, bottom-of-pyramid first**, because lower levels are
prerequisites clients adopt first and the techniques are simpler (faster wins, momentum).

**Wave 1 — Foundations (Level 0–1 across categories).** Visibility & Measurement first
(you can't optimize what you can't see), then the Level 0–1 quick wins in Model Routing,
Prompt & Context, Caching, Output. ~35 techniques.

**Wave 2 — Advanced (Level 2).** RAG, Batching/Async, Agent/Workflow, Product/UX Level-2
techniques. ~45 techniques.

**Wave 3 — Highly optimized (Level 3).** Dynamic routing, semantic caching, specialized
classifiers/extractors, self-hosted serving basics. ~30 techniques.

**Wave 4 — Near-frontier (Level 4).** Distillation, fine-tuning, speculative decoding,
adaptive/confidence routing, synthetic-data flywheels. ~14 techniques.

Within a wave, do a whole **category at a time** so sources and mental context are shared
(e.g. researching all RAG techniques together reuses the same papers and vocabulary).

### Suggested first 5 (to validate the pipeline end-to-end)
1. `visibility-measurement/token-cost-observability` (L0 — the foundation)
2. `model-routing/model-right-sizing` (L1 — biggest, simplest lever)
3. `output/max-token-policies` (L1 — trivial, high ROI)
4. `prompt-context/system-prompt-minimization` (L1)
5. `caching-reuse/exact-response-caching` (L1) — pairs with the finished prefix-caching page.

---

## 4. Working in batches with subagents (optional, faster)

For scale, research can be fanned out: one subagent per technique (or per category),
each producing a filled-in markdown file following `docs/TEMPLATE.md`, then a review pass
checks citation quality and scorecard consistency before `status: published`. Keep a
human/lead review gate — citation integrity is the whole value proposition here.

A reasonable rhythm: **research one category (8–16 techniques) per session**, then review
and build. That keeps each session's sources coherent and the diff reviewable.

---

## 5. Maintenance

- **Prices and limits drift.** `accessed:` dates flag staleness; revisit pricing-dependent
  techniques (caching, batching, routing, model choice) periodically.
- **New techniques.** Add to `src/data/taxonomy.mjs`, run `npm run gen:stubs`, research.
- **Level re-grading.** As the field matures, techniques migrate down the pyramid (today's
  "advanced" becomes tomorrow's "basic"). Re-grade during maintenance passes.

---

## 6. Project commands

```bash
npm run dev         # local preview at http://localhost:4321
npm run build       # static build to dist/ (also validates all frontmatter)
npm run preview     # serve the built site
npm run gen:stubs   # create stub files for any new techniques in the taxonomy
node scripts/generate-stubs.mjs --report   # list techniques still missing a file
```
