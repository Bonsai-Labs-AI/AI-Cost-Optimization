# Expert-Mining Findings — Approved Additions

Source: mined the public writing of ~30 AI-cost/economics experts (inference-economics
writers, Epoch AI, FinOps-for-AI, VC unit-economics, quantization/serving academics) and
compared against the live catalog. This file is the **approved** worklist only — items the
reviewer accepted. Serving-infrastructure techniques (disaggregation, continuous batching,
speculative decoding, KV-cache compression, GPU/parallelism selection, MoE serving) were
**deliberately rejected as out of scope** — this catalog is about making AI *products*
cheaper, not about how to host models.

Status legend: ⬜ not started · 🟨 drafting · ✅ published · ⏭️ skipped (already covered)

> **Implementation log — 2026-07-21.** Shipped and validated via `npm run build` (69 pages, no
> errors): **A1 BYOK** and **A3 Token-Efficient Serialization** as new pages (each 8 verified
> primary sources); **B1, B2, B5** as sub-additions to existing pages. **B8 and B9 were dropped
> on inspection** — the target pages already cover them well (see notes below); adding them would
> have been redundant padding, against the world-class-quality bar. **B3** was already confirmed
> covered earlier. Net: 2 new techniques + 3 page enrichments.

---

## A. New standalone techniques (2)

### A1 ✅ Bring-Your-Own-Key (BYOK)
- **Category / slug:** `product-ux` / `bring-your-own-key`
- **Proposed level:** 1
- **Effort / Gain / Risk:** Low / High / Low
- **What:** Let customers supply their own model-provider API key so inference is billed
  directly to *their* provider account; you charge for the product/outcome, not the tokens.
- **Cost lever:** Removes inference cost from your COGS entirely — the single most powerful
  margin move as inference commoditizes. Pairs naturally with outcome-based pricing.
- **When it does NOT work:** consumer/prosumer products where asking for a key is UX friction;
  cases where you need to control the model/version for quality or safety; where you want to
  mark up inference as a revenue line.
- **Sources:** Tanay Jaipuria, "The Gross Margin Debate in AI"
  <https://www.tanayj.com/p/the-gross-margin-debate-in-ai>; Tomasz Tunguz,
  "So You Want to Sell Inference" <https://tomtunguz.com/so-you-want-to-sell-inference/>

### A3 ✅ Token-Efficient Serialization (CSV/TSV over JSON)
- **Category / slug:** `prompt-context` / `token-efficient-serialization`
- **Proposed level:** 1
- **Effort / Gain / Risk:** Low / Medium / Low
- **What:** Serialize tabular/structured data going *into* the prompt (and requested back
  *out*) as CSV/TSV instead of JSON, since JSON's repeated keys, braces and quotes inflate
  token counts for identical information. Applies to RAG rows, tool results, bulk-classification
  I/O.
- **Cost lever:** 30–60% fewer input/output tokens for the same payload — the wire format
  itself is the lever, independent of model, caching, or routing.
- **When it does NOT work:** deeply nested / non-tabular data where CSV loses structure;
  when downstream strictly needs JSON; when a structured-output/JSON-schema mode is required
  for reliability (weigh token savings vs parse safety — see `output/structured-outputs`).
- **Relationship to existing pages:** adjacent to `structured-context-packing` and
  `structured-outputs`, but neither covers the serialization/wire-format token tax. Cross-link.
- **Source:** FinOps Foundation, "Token Economics: The Atomic Unit of AI Value"
  <https://www.finops.org/insights/token-economics-the-atomic-unit-of-ai-value/>

---

## B. Sub-technique additions to existing pages (5)

### B1 ✅ Distillation-as-a-pipeline → `fine-tuning/fine-tuning-cheaper-models`
> Implemented as a new **"Why this is a moat, not just a saving"** subsection (the page already
> had the distillation flywheel + QLoRA mechanics; what was missing was the strategic/PE framing).
Add the productionized playbook (not just one-off fine-tuning): route production traffic
through a frontier **teacher**, distill to a sub-8B **student** on your proprietary
input/output pairs (QLoRA 4-bit frozen-base fits a 65B model on one 48 GB GPU; ~99% of
reference quality in ~24 h on one GPU), deploy on cheap hardware, and **fold outputs back
into the next fine-tune** (a flywheel). Frame it as a *defensible, non-copyable cost moat*
versus tactical routing/caching — the strategic angle a PE audience cares about.
- **Source:** Tomasz Tunguz, "So You Want to Sell Inference"
  <https://tomtunguz.com/so-you-want-to-sell-inference/>

### B2 ✅ LLM gateway as a cost control plane → `model-routing/provider-and-fallback-routing`
The page already covers gateways for *routing/fallback*. Add only the **governance facet**
it lacks: a gateway as a centralized cost control plane — **virtual/per-team keys,
per-key rate limits and spend caps, org-wide token/cost tracking and attribution, and a
single place to enforce a cheaper-model downgrade**. This is the "one throat to choke" for
cost observability across an org's AI usage. Do NOT re-explain gateway basics (already there).
- **Source:** Adnan Masood, "Primer on AI Gateways"
  <https://medium.com/@adnanmasood/primer-on-ai-gateways-llm-proxies-routers-definition-usage-and-purpose-9b714d544f8c>

### B5 ✅ Route on net cost, not per-token price → `model-routing/dynamic-model-routing`
> Sourced to the **Price Reversal Phenomenon** paper (Chen, Stoica, Zaharia, Zou et al.: 32% of
> model pairs reverse, up to 28×; cheaper model can take 10× more turns) — a stronger primary than
> the miner's FinOps attribution, which didn't actually contain the trajectory claim.
Add the direction-changing caveat: validate **net** cost after routing, not per-token price.
A weaker/cheaper model can produce dramatically longer output or tool-call trajectories that
*erase* the per-token savings (cheaper-per-token can be more expensive per outcome). Route on
measured cost-per-completed-task, and monitor trajectory length as a guard metric.
- **Source:** FinOps Foundation, "Token Economics"
  <https://www.finops.org/insights/token-economics-the-atomic-unit-of-ai-value/>

### B8 ⏭️ Conversation reset / summarize the quadratic context tax — ALREADY COVERED
On inspection, `agent-workflow/agent-memory-management` already teaches this thoroughly: the O(n²)
per-step growth in the Overview, rolling-trace summarization/compaction (§1, "trigger at ~70%"),
structured-state objects, and tool-result clearing — backed by Anthropic's rigorous primary data
(84% token reduction on a 100-turn eval, +29%/+39% gains). Adding the Garcia/FinOps-Weekly
"42× by step 12" secondary datapoint would duplicate a stronger existing treatment. **Skipped to
avoid padding.** (If desired later, the only marginally-new nuance is *task-boundary* reset as a
trigger distinct from token-threshold compaction — a one-line addition at most.)

### B9 ⏭️ MCP tool-definition pruning / lazy loading — ALREADY COVERED
On inspection, `agent-workflow/tool-use-minimization` **is** this technique: the "MCP init tax"
section (per-turn re-send, 500–1,500 tokens/tool, 54,600-token servers, 143K/200K-window example),
deferred/dynamic tool loading (Tool Search, `defer_loading`), description dieting, and skill
lazy-loading — all with stronger primary sources (Anthropic Engineering: 85–98.7% reductions) than
the CloudZero "7K–50K tokens/turn" secondary. Nothing to add. **Skipped as fully covered.**

---

## Rejected / not pursued (for the record)
- **B3 Provider price arbitrage** — already fully covered in `provider-and-fallback-routing`
  (open-weight 3×+ spread; Azure Global/Data-Zone/Regional; committed-use/contractual). No-op.
- **A2, B4, B6, B7, B10, B11** — reviewer declined.
- **Serving-infrastructure category (6 techniques)** — out of scope by standing decision.
- **Data/claim updates (C1–C7)** — applied 2026-07-21 after re-verifying each source by WebFetch:
  C1 price-reversal → reasoning-token-budgeting (dynamic-model-routing already had it); C2 consumption-growth
  (Ding), scoped to spend not pricing → cost-aware-product-tiers; C3 self-consistency-rarely-pays (Cost-of-Pass),
  reassigned to llm-cascades (its real home, where self-consistency is used as a gate); C4 price-decline cadence
  (a16z ~10×/yr, Epoch ~50×/yr) → model-right-sizing Step 5; C6 fixed the stale batch×cache math
  (50%→~90% cache ⇒ 75%→~95% on the cached prefix) in batch-api-usage, reconciling it with the prompt-caching and
  deferred-generation pages. **C5 skipped** — the output pages already state the output/input asymmetry with primary
  provider-pricing citations (4–8×) and current 2026 prices, stronger than the CloudZero source it was drawn from.

---

## Implementation notes
Per repo process, for the 2 new techniques (A1, A3): add each to `src/data/taxonomy.mjs`
first, then `npm run gen:stubs`, author against `docs/TEMPLATE.md`, set
`status: published` + `maturityProvisional: false`, then `npm run build` to validate
frontmatter + citation sync. The 5 sub-additions (B1, B2, B5, B8, B9) are edits to existing
`.md` bodies + a `sources` entry each — no taxonomy change.
