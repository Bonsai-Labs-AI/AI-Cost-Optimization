# Catalog decisions ledger

Authoritative record of the per-technique review decisions. Applied to
`src/data/taxonomy.mjs` + content files in one pass after the full walkthrough.
Status legend: KEEP · MOVE (old→new level) · MERGE · RENAME · ADD · REMOVE.

---

## 1. visibility-measurement — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| token-cost-observability | KEEP | L0 |
| per-feature-cost-attribution | MERGE → tag-based-cost-attribution | (removed) |
| per-customer-cost-attribution | MERGE → tag-based-cost-attribution | (removed) |
| cost-dashboards | MOVE L1→L0 | L0 |
| quality-cost-evaluation-suite | MOVE L2→L1 | L1 |
| budget-limits-guardrails | KEEP | L1 |
| cost-regression-tests | MOVE L3→L2 | L2 |
| cost-anomaly-detection | MOVE L3→L2 | L2 |
| prompt-version-cost-tracking | KEEP (no rename) | L2 |
| **tag-based-cost-attribution** | ADD (from merge; covers feature/customer/agent-run dims) | **L1** |
| **cache-hit-rate-instrumentation** | ADD | **L2** |
| unit-economics-cost-per-task | SKIP | — |

Net: 9 → 9 (merged 2→1, added 1).

---

## 2. model-routing — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| model-right-sizing | KEEP (absorbs task-based-model-selection) | L1 |
| task-based-model-selection | MERGE → model-right-sizing | (removed) |
| dynamic-model-routing | KEEP (absorbs quality-aware-routing) | L3 |
| quality-aware-routing | MERGE → dynamic-model-routing | (removed) |
| llm-cascades | KEEP (absorbs cheap-to-expensive-escalation) | L3 |
| cheap-to-expensive-escalation | MERGE → llm-cascades | (removed) |
| confidence-based-routing | REMOVE | (removed) |
| provider-routing | KEEP | L2 |
| fallback-routing | KEEP | L2 |
| local-open-weight-substitution | KEEP (add break-even caveat) | L3 |
| **reasoning-token-budgeting** | ADD | **L2** |
| **router-training-from-traffic** | ADD | **L4** |
| open-weight-via-managed-api | SKIP | — |

Net: 10 → 8 (merged 3, removed 1, added 2).

---

## 3. prompt-context — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| prompt-cleanup | KEEP (absorbs system-prompt-minimization) | L0 |
| system-prompt-minimization | MERGE → prompt-cleanup | (removed) |
| prompt-modularization | KEEP | L1 |
| long-context-avoidance | KEEP | L1 |
| few-shot-example-pruning | KEEP | L2 |
| structured-context-packing | KEEP | L2 |
| context-window-budgeting | KEEP | L2 |
| static-dynamic-prompt-separation | REMOVE | (removed) |
| prompt-compression | RENAME → learned-prompt-compression | L3 |
| conversation-summarization | MOVE L2→L3 | L3 |
| context-pruning | MOVE L2→L3 (scope: retrieved/tool-output) | L3 |
| **context-offloading** | ADD | **L3** |
| **dynamic-few-shot-selection** | ADD | **L3** |

Net: 11 → 11 (merged 1, removed 1, renamed 1, added 2).

---

## 4. caching-reuse — ✅ decided

User ran this category more conservative than agents: cache invalidation/freshness is
treated as real difficulty, pushing several caches UP a tier. Encode TTL/expiration/
invalidation guidance in each caching technique's body.

| Technique | Decision | Final |
|---|---|---|
| prompt-caching-prefix-caching | KEEP (published reference) | L1 |
| exact-response-caching | MOVE L1→L2 (TTL/expiration correctness) | L2 |
| embedding-caching | KEEP | L2 |
| summary-caching | KEEP standalone | L2 |
| semantic-caching | KEEP | L3 |
| retrieval-result-caching | MOVE L2→L3 (freshness/invalidation) | L3 |
| tool-result-caching | MOVE L2→L3 (freshness/invalidation) | L3 |
| intermediate-artifact-caching | REMOVE | (removed) |
| cache-aware-agent-design | KEEP (design-time prefix opt) | L3 |
| cache-invalidation-strategies | KEEP standalone | L3 |
| generative-structural-caching | SKIP | — |

Net: 10 → 9 (removed 1).

---

## 5. batching-async — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| batch-api-usage | KEEP (absorbs offline-queueing) | L1 |
| offline-queueing | MERGE → batch-api-usage | (removed) |
| bulk-extraction-classification | KEEP | L2 |
| latency-tiered-processing | MOVE L2→L3 | L3 |
| pre-generation | MOVE L2→L3 (infra precompute) | L3 |
| background-enrichment | REMOVE | (removed) |
| workload-scheduling | REMOVE | (removed) |
| async-report-generation | REMOVE | (removed) |
| multi-item-prompt-batching | SKIP | — |

Net: 8 → 4 (merged 1, removed 3).

---

## 6. rag — ✅ decided

User scoped RAG tightly to DIRECT cost levers, removing retrieval-quality-engineering
items (query rewriting/classification, citation-first, answerability, hybrid-search).

| Technique | Decision | Final |
|---|---|---|
| metadata-filtering | MOVE L2→L1 | L1 |
| chunk-size-optimization | RENAME → chunking-parameter-tuning (absorbs chunk-overlap + semantic-chunking) | L1 |
| chunk-overlap-optimization | MERGE → chunking-parameter-tuning | (removed) |
| reducing-retrieved-chunk-count | KEEP | L1 |
| reranking-before-generation | KEEP (absorbs multi-stage-retrieval) | L2 |
| multi-stage-retrieval | MERGE → reranking-before-generation | (removed) |
| hierarchical-retrieval | KEEP | L3 |
| contextual-compression | KEEP (add cheap-long-ctx caveat) | L3 |
| precomputed-document-summaries | MOVE L2→L3 (absorbs summary-index-routing) | L3 |
| better-retrieval-filtering | REMOVE | (removed) |
| hybrid-search-tuning | REMOVE | (removed) |
| query-rewriting | REMOVE | (removed) |
| query-classification | REMOVE | (removed) |
| document-level-routing | REMOVE | (removed) |
| answerability-detection | REMOVE | (removed) |
| citation-first-generation | REMOVE (quality, not cost) | (removed) |
| **embedding-quantization-mrl** | ADD | **L3** |
| **graphrag-vs-vector-tradeoff** | ADD | **L4** |
| semantic-chunking | ADD → folded into chunking-parameter-tuning | (folded) |
| late-chunking / contextual-retrieval / adaptive-retrieval / drop-reranker | SKIP | — |
| summary-index-routing | ADD → folded into precomputed-document-summaries | (folded) |

Net: 16 → 9 (removed 7, merged 2, added 2).

---

## 7. output — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| output-length-control | MOVE L1→L0 | L0 |
| structured-outputs | KEEP (absorbs json-function-call-outputs) | L1 |
| json-function-call-outputs | MERGE → structured-outputs | (removed) |
| max-token-policies | KEEP (note: doesn't bound reasoning tokens) | L1 |
| streaming-with-early-stop | KEEP | L2 |
| template-plus-fill | KEEP | L2 |
| post-processing-instead-of-generation | KEEP (absorbs deterministic-formatting; can reach L3 for sophisticated pipelines) | L2 |
| deterministic-formatting | MERGE → post-processing | (removed) |
| progressive-disclosure | REMOVE | (removed) |
| short-answer-first-ux | REMOVE | (removed) |
| **verbosity-controls** | ADD | **L1** |
| **constrained-decoding** | ADD (self-hosted grammars) | **L3** |
| draft-then-refine | SKIP | — |

Net: 10 → 8 (merged 3, removed 1, added 2). Content flag: drop the outdated
"structured outputs add 5–15% latency" claim.

---

## 8. fine-tuning — ✅ decided

User view: fine-tuning is ONE core technique; distillation, synthetic data, and
LoRA/QLoRA are *methods* inside it, not peers.

| Technique | Decision | Final |
|---|---|---|
| fine-tuning-cheaper-models | KEEP — umbrella; absorbs distillation + synthetic-data-generation + LoRA/QLoRA (as methods) | L3 |
| distillation | MERGE → fine-tuning-cheaper-models | (removed) |
| synthetic-data-generation | MERGE → fine-tuning-cheaper-models | (removed) |
| fine-tuning-shorter-prompts | REMOVE | (removed) |
| task-specific-classifiers | KEEP | L3 |
| task-specific-extractors | KEEP (separate) | L3 |
| specialized-embedding-models | KEEP | L3 |
| smaller-embedding-models | REMOVE | (removed) |
| local-model-deployment | KEEP (self-host fine-tuned narrow model at scale) | L4 |
| fine-tuned-rerankers | REMOVE | (removed) |
| fine-tuned-routing-classifiers | MERGE → model-routing/router-training-from-traffic | (removed) |
| LoRA/QLoRA | ADD → folded into fine-tuning-cheaper-models | (folded) |
| **calibrated-quantization** | ADD (GPTQ/AWQ/SmoothQuant + QAT; model-production, distinct from infra serving-side `quantization`) | **L4** |

Net: 11 → 6 (removed 3, merged 3, added 1).

---

## 9. agent-workflow — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| agent-loop-limits | RENAME → agent-budget-guardrails (absorbs tool-call + retry limits). FRAME BROADLY: prompt-level budget-awareness + output organization, not just hard counters | L1 |
| tool-call-limits | MERGE → agent-budget-guardrails | (removed) |
| retry-limits | MERGE → agent-budget-guardrails | (removed) |
| tool-use-minimization | KEEP | L2 |
| human-in-the-loop-checkpoints | KEEP (absorbs expensive-action-confirmation) | L2 |
| expensive-action-confirmation | MERGE → human-in-the-loop-checkpoints | (removed) |
| specialized-sub-agents | KEEP (encode 15×-tokens caveat) | L3 |
| state-compression-for-agents | KEEP (absorbs agent-trace-summarization) | L3 |
| agent-trace-summarization | MERGE → state-compression-for-agents | (removed) |
| reusable-memory-artifact-store | KEEP | L3 |
| workflow-decomposition | MOVE L2→L3 | L3 |
| plan-then-execute-budgeting | REMOVE | (removed) |
| agentic-cache-strategy | REMOVE | (removed) |
| agent-step-deduplication | REMOVE | (removed) |
| cost-aware-planning | REMOVE | (removed) |
| model-cascades-for-agents | → covered by model-routing/llm-cascades | (skip) |
| prompt-compression-for-agents | SKIP (covered by learned-prompt-compression) | — |

Net: 15 → 7 (removed 4, merged 4).

---

## 10. infra-serving — ✅ decided → CATEGORY REMOVED

Scope call: deep self-hosted-serving / GPU-kernel engineering is out of scope for
"cost optimization for AI products." The self-hosting path is represented by
`fine-tuning/local-model-deployment` (L4) + `fine-tuning/calibrated-quantization` (L4).

- ALL 13 techniques REMOVED (quantization, continuous-batching, speculative-decoding,
  kv-cache-optimization, autoscaling-inference, serverless-vs-provisioned,
  serving-framework-choice, multi-tenant-isolation, gpu-utilization-optimization,
  load-balancing, request-batching, model-warm-pools, cold-start-reduction).
- `quantization`'s serving-side note → folded into fine-tuning/calibrated-quantization.
- ALL additions SKIPPED (multi-LoRA-serving, disaggregated-prefill-decode,
  prefix-cache-aware-routing, kv-cache-offload, chunked-prefill, spot-preemptible-gpu).
- **Remove the `infra-serving` category from CATEGORIES (11 → 10 categories).**

Net: 13 → 0 (category removed).

---

## 11. product-ux — ✅ decided

| Technique | Decision | Final |
|---|---|---|
| ai-feature-gating | KEEP (absorbs expensive-feature-confirmation) | L1 |
| expensive-feature-confirmation | MERGE → ai-feature-gating | (removed) |
| user-controlled-quality-mode | KEEP | L2 |
| ai-non-ai-hybrid-ux | KEEP | L2 |
| precomputed-pregeneration | RENAME → precomputed-content-surfacing | L2 |
| cost-aware-product-tiers | MOVE L2→L3 (absorbs usage-based-pricing-alignment) | L3 |
| usage-based-pricing-alignment | MERGE → cost-aware-product-tiers | (removed) |
| progressive-ai-depth | REMOVE | (removed) |
| default-cheap-optional-deep | REMOVE | (removed) |
| quota-fair-use-design | REMOVE | (removed) |
| human-review-on-exceptions | REMOVE | (removed) |
| graceful-abstain-ux | SKIP | — |

Net: 11 → 5 (removed 4, merged 2, renamed 1).

---

## FINAL TALLY

124 → **76 techniques** across **10 categories** (infra-serving removed).

| Category | Count |
|---|---|
| visibility-measurement | 9 |
| model-routing | 8 |
| prompt-context | 11 |
| caching-reuse | 9 |
| batching-async | 4 |
| rag | 9 |
| output | 8 |
| fine-tuning | 6 |
| agent-workflow | 7 |
| product-ux | 5 |

Pyramid is no longer top-heavy: L4 is now a small true-frontier set
(router-training-from-traffic, graphrag-vs-vector, local-model-deployment,
calibrated-quantization).

---

# DEEP-RESEARCH VALIDATION PASS (round 2)

Per-category deep online research validating the list for "cost optimization in AI
products." Agents largely CONFIRMED the catalog; recorded below are the deltas + key
freshness notes to apply during authoring.

## model-routing — ✅ deep-validated
All 8 techniques CONFIRMED (tiers + merges hold). Decisions:
- provider-native auto-router → DON'T add standalone; document as the zero-config end of `dynamic-model-routing`.
- prompt-adaptive / context-aware (input-size) selection → fold into `dynamic-model-routing` as a routing signal.
- model-version-migration tracking → SKIP.
- `fallback-routing` → KEEP L2 but body MUST carry the cost framing (cheap primary + spillover; it's reliability-primary).
- Freshness: GPT-5 has a built-in main/mini/thinking router (cite in dynamic-routing + router-training). `local-open-weight-substitution` body must stay honest that APIs win below very high volume.
No taxonomy change (still 8).

## visibility-measurement — ✅ deep-validated
- quality-cost-evaluation-suite → RE-TIER L1→L2 (the L2-defining eval investment).
- prompt-version-cost-tracking → MERGE into `tag-based-cost-attribution` (same call-site tagging; prompt_version is one more dim).
- ADD **unit-economics-cost-per-outcome** at **L3** (cost per resolved outcome / AI unit margin). (Reversed the round-1 skip.)
- spend-forecasting → SKIP. cache-hit-rate-instrumentation stays L2.
- Freshness: token usage objects now split cached/reasoning/audio/image tokens (fold per-token-type breakdown into token-cost-observability body); OTel `gen_ai.*` semantic conventions are the portable substrate.
Net: 9 → 9 (merged 1, added 1).

## prompt-context — ✅ deep-validated
All 11 CONFIRMED. Additions:
- ADD **provider-native-context-management** at **L2** (Anthropic context editing + memory tool; ~84% token cut via config). The L3 trio (context-pruning/offloading/summarization) = the custom-build path.
- ADD **automated-prompt-optimization** at **L3** (DSPy/GEPA — optimizer-minimized prompts).
- Freshness for bodies: "compaction" = standard term for conversation-summarization; reasoning models need fewer/zero few-shots; model-specific format guidance (XML/Claude, Markdown/GPT-5); temper LLMLingua to realistic 4–10× band.
Net: 11 → 13 (added 2).

## caching-reuse — ✅ deep-validated
All 9 CONFIRMED; invalidation-difficulty lens independently validated. No new entries:
- gateway-level caching → FOLD into `semantic-caching` (gateway = the deploy/buy path; also covers exact).
- provider-native compaction (Anthropic Compaction API + memory tool) → FOLD into `summary-caching` (DIY vs managed).
- **MUST-FIX on authored prompt-caching page:** OpenAI cached input is now **~90% off** (GPT-5.x), NOT 50% — update Overview + provider section + the source note. Add ProjectDiscovery case study (7%→84% hit rate, 59% cost cut via static-first/volatile-last).
Net: 9 → 9 (no change).

## batching-async — ✅ deep-validated
All 4 CONFIRMED. No new entries:
- flex processing (OpenAI `service_tier:"flex"`, ~50% off over sync API) → FOLD into `batch-api-usage` as a variant.
- multi-item prompt batching → FOLD into `bulk-extraction-classification` as the mechanism.
- Freshness: batch+caching discounts stack (~75% off); OpenAI has 4 tiers (Batch/Flex/Standard/Priority); Priority is a PREMIUM (note as the spend-up end). Stub frontmatter for latency-tiered + pre-generation says L2 but taxonomy says L3 — fixed by the resync below.
Net: 4 → 4 (no change).

## NOTE — stub frontmatter level sync
Round-1 re-tiers updated taxonomy.mjs but NOT the existing stub `.md` frontmatter levels
(content pages read frontmatter, so re-tiered-but-not-renamed stubs still show OLD levels).
FINAL APPLY must resync: delete all stubs except the authored prompt-caching page, then
re-run gen:stubs so every stub's level/title/category matches taxonomy.mjs.

## rag — ✅ deep-validated
- hierarchical-retrieval → KEEP L3 (owner kept it).
- chunking-parameter-tuning → RE-TIER L1→L2 (eval-driven tuning).
- ADD **retrieval-chunk-deduplication** at **L2** (remove near-duplicate retrieved chunks pre-LLM).
- RAG caching (prefix + semantic-answer) → CROSS-LINK to caching-reuse, no new entry.
- Scope note: metadata-filtering + embedding-quantization-mrl are vector-DB/infra cost, not token cost — frame honestly. hierarchical body must note its cost is "fewer retrieved units," not smaller context.
Net: 9 → 10 (added 1).

## output — ✅ deep-validated
All 8 CONFIRMED. No taxonomy change:
- streaming-with-early-stop → KEEP L2. predicted-outputs → SKIP.
- Body notes: cross-link `reasoning-token-budgeting` aggressively + broaden category def of "output tokens" to include hidden reasoning tokens (the dominant output cost on reasoning models); DELETE stale "structured outputs add 5–15% latency" claim (now ~0 overhead) but ADD the 10–30% reasoning-accuracy caveat; constrained-decoding is ~free at decode in 2026 (reframe as reliability, not token-savings); max-token does NOT bound reasoning tokens (rule of thumb max_tokens ≈ 4× visible output).
Net: 8 → 8 (no change).

## fine-tuning — ✅ deep-validated
All 6 CONFIRMED; umbrella framing validated.
- ADD **multi-lora-serving** at **L4** (100–200 adapters/GPU; makes owning many narrow models cheap).
- calibrated-quantization → KEEP L4; body notes post-training AWQ/GPTQ is L3-effort, QAT is the L4 piece.
- distillation flywheel → KEEP as a method inside fine-tuning-cheaper-models (cross-link router-training-from-traffic).
- RESCOPE specialized-embedding-models body to LEAD with Matryoshka truncation (the direct cost lever) + domain fine-tuning; keep distinct from the removed smaller-embedding-models.
- Freshness (big): OpenAI self-serve fine-tuning winding down (May 2026 announcement) → center of gravity = open-weight + LoRA/QLoRA and Bedrock/Vertex managed-open. Every FT page needs a vendor-availability caveat.
Net: 6 → 7 (added 1).

## agent-workflow — ✅ deep-validated
All 7 CONFIRMED; broad agent-budget-guardrails framing validated by budget-aware-tool-use research.
- ADD **programmatic-tool-calling** (code-execution with MCP) at **L3** — agent writes code calling tools as APIs, only final result returns; ~98.7% token cut, GA Anthropic Feb 2026. Highest-impact gap in the catalog.
- tool-use-minimization → absorbs **deferred-tool-loading** (dynamic tool retrieval, solves 100k+ MCP init tax) AND **agent-skill lazy-loading** as advanced sections.
- Body notes: state-compression + reusable-memory now have native-primitive entry points (context editing / memory tool) — cross-link prompt-context/provider-native-context-management. specialized-sub-agents: lead with the 15× token-multiplier trade-off (net win only when tasks parallelize).
Net: 7 → 8 (added 1).

## product-ux — ✅ deep-validated
All 5 CONFIRMED.
- cheap-preview-then-commit → FOLD into `user-controlled-quality-mode` (two-stage commit variant).
- ADD **agent-scope-confirmation** at **L2** (confirm clarifying Q / plan before expensive agent runs).
- cost-aware-product-tiers → KEEP L3 but RESCOPE body to spend-bounding only (usage caps, abuse-limited free tiers, model-access gating); exclude pricing/margin (monetization).
- prompt-scaffolding → SKIP. Body note: add debounce/throttle to ai-feature-gating.
Net: 5 → 6 (added 1).

---

# DEEP-PASS FINAL TALLY → 82 techniques / 10 categories

| Category | Round-1 | Deep-pass | Change |
|---|---|---|---|
| visibility-measurement | 9 | 9 | merged 1, added 1 |
| model-routing | 8 | 8 | — |
| prompt-context | 11 | 13 | +2 |
| caching-reuse | 9 | 9 | — |
| batching-async | 4 | 4 | — |
| rag | 9 | 10 | +1 |
| output | 8 | 8 | — |
| fine-tuning | 6 | 7 | +1 |
| agent-workflow | 7 | 8 | +1 |
| product-ux | 5 | 6 | +1 |
| **TOTAL** | **76** | **82** | **+6** |

## L3 → L4 rebalancing pass
L3 was bulging (32) vs a thin L4 (5). Promoted 4 frontier/adaptive techniques L3→L4:
`automated-prompt-optimization` (prompt-context), `contextual-compression` (rag),
`programmatic-tool-calling` + `specialized-sub-agents` (agent-workflow).
Final distribution: **L0=4, L1=14, L2=27, L3=28, L4=9** (82 total).
L4 set: router-training-from-traffic, automated-prompt-optimization, contextual-compression,
graphrag-vs-vector-tradeoff, local-model-deployment, calibrated-quantization,
multi-lora-serving, programmatic-tool-calling, specialized-sub-agents.
