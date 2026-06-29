# Wave 1 research briefs — Foundations (L0 + L1)

**Scope:** the 17 foundation techniques (all L0 + L1, minus the already-done Prompt Caching).
These are the easy, high-confidence wins clients adopt first — the bottom of the pyramid.

**How to use a brief:** it's the spec the research executes against. For each item, resolve
the **Key questions** against primary sources, confirm/adjust the **Scorecard hypothesis**,
fold in the **2026 freshness** notes, then fill the page per `docs/TEMPLATE.md` (4 body
sections + frontmatter scorecard + detection signals + measurement + structured `sources`).

**Definition of done** (per `docs/RESEARCH_PLAN.md`): all 4 body sections written with
concrete detail; ≥5 quality sources with primaries for every number; scorecard + detection
signals + measurement filled and defensible; `status: published`, `maturityProvisional:
false`, `lastUpdated` set; `npm run build` passes.

Reference example for quality bar: `caching-reuse/prompt-caching-prefix-caching.md`.

> Scorecard scales — Effort: Low/Med/High · Gain: Low/Med/High/Very High · Risk: Low/Med/High.

---

## L0 — Not Optimized / obvious-waste hygiene

### 1. token-cost-observability — Token & Cost Observability (L0 · visibility)
- **Scope:** per-request/per-trace logging of token counts + cost + latency. The precondition for every other technique ("you can't optimize what you can't see").
- **Key questions (primary sources):**
  1. What's the minimal instrumentation that captures **all 2026 token types** — input / output / **cached** / **reasoning(thinking)** / audio / image — each priced differently? (provider usage objects; Langfuse usage-types docs)
  2. Build-vs-buy: OpenTelemetry `gen_ai.*` semantic conventions + Langfuse/Helicone/Datadog LLM Obs vs gateway auto-emit (LiteLLM/Portkey/Bifrost). What's the lock-in tradeoff?
  3. What does raw capture *enable* downstream (attribution, cache-hit-rate, unit-economics)? Make the "foundation" case concrete.
  4. Realistic effort to add to an existing app (SDK wrapper vs proxy)?
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium** (enabler, not a direct saver) · Risk **Low**.
- **Detection signals (seed):** no per-call token/cost logging; spend only visible at the monthly invoice; can't answer "which feature costs what."
- **Measurement (seed):** % of calls instrumented; presence of per-token-type breakdown.
- **2026 freshness:** per-token-type breakdown is now mandatory (reasoning/cached tokens dominate or distort spend); OTel `gen_ai.*` is the emerging portable substrate (still partly experimental). Datadog maps it natively.
- **Target sources:** Langfuse token/cost docs, OTel GenAI conventions, Helicone/Datadog LLM Obs, a provider usage-object reference.

### 2. cost-dashboards — Cost Dashboards (L0 · visibility)
- **Scope:** the aggregation/visualization layer on top of observability — spend by model/feature/user/time. Distinct from observability (raw capture vs the view).
- **Key questions:**
  1. What's the standard set of cost views product teams actually need (by model, feature, customer, time, token-type)?
  2. Which tools ship this no-code (Langfuse/Helicone/Datadog/Braintrust/CloudZero/Finout) and where's the build line?
  3. Why L0 not L1 — is a dashboard genuinely "turn it on," or does useful dashboarding require the attribution tags (L1) first? (resolve the dependency honestly)
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** (visibility enabler) · Risk **Low**.
- **Detection signals (seed):** spend not visualized; no trend/breakdown view; surprises at invoice time.
- **Measurement (seed):** dashboard exists with model+feature breakdown; time-to-detect a cost change.
- **2026 freshness:** mostly off-the-shelf; cross-link tag-based-cost-attribution (dashboards are only as good as the tags feeding them).
- **Target sources:** Braintrust/CloudZero "track LLM costs" guides, Langfuse/Helicone dashboards docs.

### 3. prompt-cleanup — Prompt Cleanup (L0 · prompt-context)
- **Scope:** strip boilerplate, dead instructions, redundant restatements, stale few-shot, leftover scaffolding. Absorbs system-prompt-minimization (remove waste anywhere, system prompt included). Distinct from modularization (remove vs reuse).
- **Key questions:**
  1. What are the common sources of prompt bloat in production (accreted instructions, duplicated context, verbose system prompts, unused tool descriptions)?
  2. How much input-token reduction is realistic from cleanup alone, and how to verify no quality loss?
  3. The 2026 framing: Anthropic's "smallest set of high-signal tokens" / context-engineering principle — cite it.
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** · Risk **Low**.
- **Detection signals (seed):** system prompt grown by accretion; repeated/again-stated instructions; few-shot examples never revisited.
- **Measurement (seed):** input tokens per call before/after; quality eval unchanged.
- **2026 freshness:** "context engineering" is the current term; pair with prompt-caching (a clean static block caches better).
- **Target sources:** Anthropic context-engineering guidance; practitioner prompt-bloat write-ups.

### 4. output-length-control — Output Length Control (L0 · output)
- **Scope:** prompt-side brevity — "be concise," bounded list lengths, answer-in-N-sentences. Distinct from max-token-policies (hard API cap) and verbosity-controls (provider param).
- **Key questions:**
  1. Realistic output-token savings from brevity instructions (practitioner data cites 40–70%)? Source it.
  2. Why this matters most in 2026: output billed ~4–8× input on frontier rate cards — quantify with current pricing.
  3. The reasoning-model caveat: brevity instructions shrink the *visible* answer but not the hidden reasoning trace — so partial leverage there (point to reasoning-token-budgeting).
  4. Quality risk: where does terseness hurt (truncated reasoning, dropped caveats)?
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium–High** · Risk **Low–Medium** (over-terse can degrade).
- **Detection signals (seed):** output much longer than needed; verbose preambles/restatement; long outputs on simple asks.
- **Measurement (seed):** output tokens per request; quality score held constant.
- **2026 freshness:** output/input price asymmetry; reasoning-trace caveat.
- **Target sources:** provider pricing pages; concise-CoT tradeoff studies; practitioner token-optimization posts.

---

## L1 — Basic Optimization / low-effort high-confidence wins

### 5. tag-based-cost-attribution — Tag-Based Cost Attribution (L1 · visibility)
- **Scope:** one call-site tagging primitive carrying `feature` / `customer_id` / `agent_run_id` / `prompt_version` (+ user) so spend can be sliced by any dimension. Absorbs the prompt-version dimension.
- **Key questions:**
  1. Canonical 2026 tag set and how it's propagated (metadata at the call site vs gateway virtual keys — Langfuse tags, LiteLLM/Bifrost keys)?
  2. Why it's one primitive, not N techniques (same mechanism, different dimension)?
  3. Value proof: only ~43% of orgs can attribute cost to a customer — cite; what decisions does attribution unlock (kill/route a costly feature, price a heavy customer)?
  4. Effort to retrofit onto an existing codebase.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium** (targeting enabler) · Risk **Low**.
- **Detection signals (seed):** can't answer "what does feature/customer X cost"; one big undifferentiated bill.
- **Measurement (seed):** % of spend attributable to a feature/customer; attribution coverage.
- **2026 freshness:** per-agent-run attribution is now a first-class dimension (tool-call fan-out); cross-link unit-economics-cost-per-outcome.
- **Target sources:** Braintrust attribution playbook; Langfuse tags; LiteLLM/Bifrost virtual-key docs; CloudZero 43% stat.

### 6. budget-limits-guardrails — Budget Limits & Guardrails (L1 · visibility)
- **Scope:** hard caps / kill switches / circuit breakers on spend (per key/team/customer/provider). Scope to *limits and stops* — NOT routing-on-breach (that's model-routing) and NOT product quotas (that's product-ux). Avoid the safety/PII "guardrails" meaning.
- **Key questions:**
  1. What budget hierarchies do gateways expose (LiteLLM caps; Portkey; Bifrost Customer/Team/Key/Provider; 24h+30d windows)?
  2. Hard-cap vs soft-degrade — where's the boundary with routing, and what belongs here?
  3. What runaway scenarios does this prevent (retry storms, agent loops, a single abusive key)?
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium** (caps tail risk) · Risk **Low**.
- **Detection signals (seed):** no spend ceiling; a bug/abuse could 10× the bill; no per-key limits.
- **Measurement (seed):** caps configured per key/team; incidents auto-stopped vs invoice surprises.
- **2026 freshness:** budget enforcement is one-config in modern gateways; cross-link anomaly-detection (alert before cap) and agent-budget-guardrails (in-loop).
- **Target sources:** LiteLLM budgets/rate-limits docs; Portkey/Bifrost budget docs.

### 7. model-right-sizing — Model Right-Sizing (L1 · model-routing)
- **Scope:** statically pick the smallest model that passes your quality bar per task/feature. Absorbs static task-based selection and using open-weight models via a managed API.
- **Key questions:**
  1. The price spread: cheapest tiers (nano/mini/flash-lite) vs flagships — quantify the 20–100× delta with *current* pricing (but don't hard-code a "cheapest model" — note it churns quarterly).
  2. Method: how to right-size safely — eval set + quality bar before downgrading (depends on quality-cost-evaluation-suite).
  3. When down-sizing fails (reasoning-heavy, long-tail, safety-critical tasks).
  4. Open-weight-via-managed-API as a right-sizing option (Together/Fireworks/Groq/DeepSeek $0.15–0.60/M).
- **Scorecard hypothesis:** Effort **Low** · Gain **High / Very High** (biggest single lever) · Risk **Medium** (quality regression if ungated).
- **Detection signals (seed):** same flagship model for every task incl. classification/extraction; no per-task model mapping.
- **Measurement (seed):** blended $/request; quality held at bar; % of traffic on cheapest-sufficient tier.
- **2026 freshness:** model landscape churns — frame around the *method*, not specific model names; mid-tier models routinely match last-gen flagships cheaper.
- **Target sources:** provider pricing pages + model cards; an independent price/quality comparison; OSS-via-API pricing.

### 8. prompt-modularization — Prompt Modularization (L1 · prompt-context)
- **Scope:** compose prompts from reusable, independently-editable blocks (system / tools / policy / examples) — and keep a stable shared prefix that maximizes prompt-cache hits. Distinct from cleanup (reuse vs remove).
- **Key questions:**
  1. The cache-prefix synergy: how does a stable modular system block lift prefix-cache hit rate (static-first/volatile-last)? (cross-link prompt-caching, cache-aware-agent-design)
  2. What's the *direct* cost benefit vs the indirect (caching enabler, fewer duplicated tokens)? Be honest it's largely an enabler.
  3. Practical structure: templating, partials, versioned blocks.
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** (mostly a caching/maintenance enabler) · Risk **Low**.
- **Detection signals (seed):** copy-pasted prompt fragments; volatile data interleaved in the system block (breaks cache); no shared prompt library.
- **Measurement (seed):** prefix-cache hit rate; duplicated-token count.
- **2026 freshness:** ties directly to prompt-caching economics; cross-link.
- **Target sources:** Anthropic/OpenAI prompt-caching "structure your prompt" guidance; Manus context-engineering post.

### 9. long-context-avoidance — Long-Context Avoidance (L1 · prompt-context)
- **Scope:** don't stuff whole documents/history into the window — retrieve/chunk/summarize and pass only what's needed.
- **Key questions:**
  1. Cost case: long prompts cost more *and* (per "lost-in-the-middle," still holding at 128K+ in 2025) often degrade quality — cite.
  2. The 2026 expression: "just-in-time retrieval via lightweight identifiers" / load-on-demand (Anthropic) vs dumping context.
  3. When long-context IS the right call (RAG-vs-long-context debate; the "hybrid: long context over a retrieval-bounded evidence set" consensus).
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium–High** · Risk **Low** (usually improves quality too).
- **Detection signals (seed):** entire docs/files pasted into the prompt; full chat history resent each turn; near-window-limit prompts.
- **Measurement (seed):** avg input tokens/call; quality vs a retrieval-bounded baseline.
- **2026 freshness:** lost-in-the-middle persists; RAG-vs-long-context hybrid framing.
- **Target sources:** lost-in-the-middle paper (+ 2025 confirmations); Anthropic just-in-time retrieval guidance.

### 10. batch-api-usage — Batch API Usage (L1 · batching-async)
- **Scope:** provider Batch API — ~50% off input+output for a ≤24h SLA. Absorbs offline-queueing (the managed queue IS the batch API), **flex/service-tier processing** (batch-rate over the *sync* API, slower, interactive), and notes the 4-tier model.
- **Key questions:**
  1. Current discounts/SLAs/limits across **OpenAI / Anthropic (≤100k req) / Google (Gemini Batch + Vertex; now embeddings + OpenAI-SDK-compatible) / Bedrock** — verify each.
  2. **Flex** (`service_tier:"flex"`): batch-rate ~50% over the synchronous API — when to use vs true batch; handling 429/resource-unavailable retries.
  3. Stacking: batch + prompt-caching discounts stack (~75% off) — confirm.
  4. The 4 tiers (Batch / Flex / Standard / **Priority**=premium) — when each applies.
- **Scorecard hypothesis:** Effort **Low** · Gain **High** (flat 50% on eligible volume) · Risk **Low**.
- **Detection signals (seed):** non-urgent work (enrichment, evals, backfills, reports) run on the sync standard tier.
- **Measurement (seed):** % of eligible volume on batch/flex; blended $/token vs standard.
- **2026 freshness:** batch≈50%/≤24h is universal; flex is the key 2026 add; Priority is a *premium*, not a discount.
- **Target sources:** OpenAI Batch + Flex docs; Anthropic Message Batches; Gemini/Vertex batch; Bedrock batch inference.

### 11. metadata-filtering — Metadata Filtering Before Vector Search (L1 · rag)
- **Scope:** pre-filter the candidate set by metadata (tenant, date, doc-type, ACL) *before* the ANN search. Frame honestly: the primary win is **vector-DB compute + precision** (and correctness/security), with a downstream token benefit (fewer junk chunks).
- **Key questions:**
  1. How much does pre-filtering cut ANN compute/latency (candidate-set shrink, e.g. 10M→1k)? Source.
  2. Config across vector DBs (pgvector / Pinecone / Weaviate / Qdrant) — pre- vs post-filter tradeoffs.
  3. The correctness/security angle (tenant isolation) as a bonus, not the cost headline.
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** (infra cost + precision) · Risk **Low**.
- **Detection signals (seed):** vector search across the whole corpus regardless of tenant/recency; retrieving then discarding by metadata in app code.
- **Measurement (seed):** candidate-set size; retrieval latency/cost; irrelevant-chunk rate.
- **2026 freshness:** frame as infra-cost/precision, not token-cost; pre-filter is standard in every vector DB.
- **Target sources:** vector-DB filtering docs (pgvector/Pinecone/Qdrant); pre/post-filtering guides.

### 12. reducing-retrieved-chunk-count — Reducing Retrieved Chunk Count (L1 · rag)
- **Scope:** lower top-k so the generation prompt is smaller. The single highest-ROI RAG cost lever — retrieved context typically exceeds the question by 1–2 orders of magnitude in tokens.
- **Key questions:**
  1. Quantify: retrieved-context vs question token ratio; $ impact of top-k 10→3–5. Source.
  2. How to cut top-k *safely* — reranking is the enabler (retrieve wide, rerank, keep few); cross-link reranking + chunk-dedup.
  3. Where too-few-chunks hurts (recall on multi-fact / long-tail queries) — the risk boundary.
- **Scorecard hypothesis:** Effort **Low** · Gain **High** · Risk **Medium** (recall loss if over-cut).
- **Detection signals (seed):** top-k fixed high (10–20) "to be safe"; generation prompt dominated by retrieved chunks; many retrieved chunks unused in the answer.
- **Measurement (seed):** avg chunks/tokens passed to generation; answer quality vs k; cost/query.
- **2026 freshness:** pairs with reranking + retrieval-chunk-deduplication.
- **Target sources:** RAG best-practice guides; AdaGReS (context-vs-question token ratio); reranking docs.

### 13. structured-outputs — Structured Outputs (L1 · output)
- **Scope:** schema-guaranteed JSON via JSON-mode / strict mode / function-call schemas. Absorbs json-function-call-outputs. Distinct from constrained-decoding (self-hosted grammars).
- **Key questions:**
  1. Cost narrative: it's mostly an **indirect** lever — eliminates re-ask/retry/repair loops — not raw token reduction. Frame correctly.
  2. **Freshness correction:** overhead is now ~0 (strict mode / CFG engines; schema compile cached) — the old "5–15% overhead" claim is stale; delete it.
  3. **Quality-risk caveat:** strict formats can degrade *reasoning* accuracy 10–30% when the model must emit fields before finishing CoT — cite (Tam et al.; JSONSchemaBench); which can *raise* cost via retries.
  4. Provider support matrix (OpenAI strict, Anthropic, Google, Bedrock).
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium** (indirect, via fewer retries) · Risk **Medium** (reasoning-accuracy).
- **Detection signals (seed):** prose parsed with regex; frequent JSON-parse failures + retries; format-repair passes.
- **Measurement (seed):** parse-failure/retry rate; calls-per-successful-structured-output.
- **2026 freshness:** ~0 overhead now; the reasoning-accuracy caveat; pair with constrained-decoding for self-hosted.
- **Target sources:** OpenAI Structured Outputs; JSONSchemaBench (arXiv 2501.10868); structured-output causal study (arXiv 2509.21791).

### 14. max-token-policies — Max-Token Policies by Task Type (L1 · output)
- **Scope:** set `max_tokens` caps per endpoint/task type to bound completions and prevent runaways.
- **Key questions:**
  1. **The 2026 footgun:** `max_tokens` does NOT bound reasoning/thinking tokens (billed at output rate); too-low caps truncate the *visible* answer while still paying for thinking — confirm across OpenAI + Anthropic docs.
  2. The rule of thumb (max_tokens ≈ 4× expected visible output on reasoning models; thinking ≈ 1–2× visible) — source it.
  3. Where to point readers for actually bounding the trace: reasoning-token-budgeting.
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** · Risk **Medium** (truncation if mis-set).
- **Detection signals (seed):** no per-task max_tokens; occasional runaway completions; truncated answers on reasoning models.
- **Measurement (seed):** p95 output tokens vs cap; truncation rate.
- **2026 freshness:** the reasoning-token interaction is the key fact; cross-link reasoning-token-budgeting.
- **Target sources:** Anthropic extended-thinking docs; OpenAI reasoning/max_tokens docs; reasoning-budget write-ups.

### 15. verbosity-controls — Verbosity Controls (L1 · output)
- **Scope:** provider params that scale answer length independent of reasoning — GPT-5 `verbosity` (low/med/high); broaden to cover Claude effort levels on the length axis. Distinct from prompt brevity (output-length-control) and hard caps (max-token).
- **Key questions:**
  1. What length/verbosity params exist in 2026 and how do they behave (GPT-5 verbosity; defaults getting terser)?
  2. Why it's distinct from prompt-side brevity (typed knob, model-tuned, doesn't consume prompt tokens).
  3. Measured effect on output tokens / cost at low vs high.
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium** · Risk **Low**.
- **Detection signals (seed):** default (verbose) output settings; long answers where short suffice; not using the verbosity param.
- **Measurement (seed):** output tokens at low vs default verbosity; quality held.
- **2026 freshness:** verbosity is a first-class GPT-5.x param; pair with reasoning-effort.
- **Target sources:** OpenAI GPT-5 params/cookbook; provider docs on verbosity/effort.

### 16. agent-budget-guardrails — Agent Budget Guardrails (L1 · agent-workflow)
- **Scope:** two layers — (a) **code-enforced ceilings** (loop/tool-call/retry limits via pre-call checks; circuit breakers) and (b) **prompt-level budget awareness** (a tracker surfacing remaining/consumed budget each iteration). Frame beyond naive hard limits.
- **Key questions:**
  1. The research basis: "budget-aware tool-use" — granting more tool calls doesn't raise performance; agents condition behavior on a surfaced budget (cite arXiv 2511.17006).
  2. Why enforcement must live in **code, not the system prompt** ("an agent told 'stop at $X' honors it until it's task-motivated not to") — cite.
  3. Concrete limits product teams set (max loops, max tool calls, max retries, wall-clock/$ ceiling) and framework support.
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium–High** (caps agent runaway, the top agent cost risk) · Risk **Low**.
- **Detection signals (seed):** unbounded agent loops; retry storms; no per-run cost/step ceiling; agents that occasionally "spiral."
- **Measurement (seed):** cost/steps per agent run distribution; runaway incidents; % runs hitting a ceiling.
- **2026 freshness:** two-layer framing (code ceilings + prompt budget tracker); cross-link visibility/budget-limits and product-ux/agent-scope-confirmation.
- **Target sources:** Budget-Aware Tool-Use (arXiv 2511.17006); practitioner budget-guard posts; agent-framework limit docs.

### 17. ai-feature-gating — AI Feature Gating (L1 · product-ux)
- **Scope:** only fire the expensive AI call on explicit user action/eligibility (button/CTA), not on page-load or every keystroke. Absorbs expensive-feature-confirmation (confirm before a costly run). Add the **debounce/throttle** sub-pattern for ambient AI.
- **Key questions:**
  1. The dominant silent cost leak: auto-triggered AI (autocomplete, live suggestions) firing per keystroke — how much does debounce/throttle (e.g. 300ms) save?
  2. Gating patterns: explicit-action gating, eligibility checks, confirm-before-expensive, lazy/on-demand generation, reuse-results.
  3. Real examples of "gate the call" in shipped products; margin context (AI features run lower gross margin → gating is survival).
- **Scorecard hypothesis:** Effort **Low** · Gain **Medium–High** (eliminates calls nobody asked for) · Risk **Low**.
- **Detection signals (seed):** AI runs on load / per-keystroke; expensive features with no confirm; users triggering costly runs accidentally.
- **Measurement (seed):** calls-per-active-user; % of AI calls user-initiated; cost/feature before-after gating.
- **2026 freshness:** debounce/throttle is the most common ambient-UI leak; lazy generation + result reuse cited as cheapest wins; cross-link precomputed-content-surfacing, agent-scope-confirmation.
- **Target sources:** RevenueCat AI-feature-margin posts; Netlify rate-limiting AI features; debounce UX guidance.

---

## Suggested execution order (within the wave)

Bottom-up and dependency-aware: do **token-cost-observability → tag-based-cost-attribution →
quality-cost-evaluation-suite** mental-dependency first (measurement underpins right-sizing),
then the independent quick wins (output-length-control, max-token, verbosity, batch-api,
prompt-cleanup), then the RAG/agent/product L1s. `model-right-sizing` should follow the
measurement items since it depends on an eval bar.
