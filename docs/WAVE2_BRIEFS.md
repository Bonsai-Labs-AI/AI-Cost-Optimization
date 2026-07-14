# Wave 2 research briefs — Advanced Optimization (L2)

**Scope:** the **27 Level-2 techniques** — "deliberate, measured engineering." L2 is the tier
where cost work becomes systematic: eval-backed, measured, but still built on mostly
off-the-shelf tooling (no custom model training — that's L3/L4). These are the techniques a
client adopts once the L0/L1 foundations (Wave 1) are in place.

**How to use a brief:** it's the spec the research executes against. For each item, resolve
the **Key questions** against primary sources, confirm/adjust the **Scorecard hypothesis**,
fold in the **2026 freshness** notes, then fill the page per `docs/TEMPLATE.md` (4 body
sections + frontmatter scorecard + detection signals + measurement + structured `sources`).

**Definition of done** (per `docs/RESEARCH_PLAN.md`): all 4 body sections written with
concrete detail; **≥5 quality sources** with primaries for every number; scorecard +
detection signals + measurement filled and defensible; `status: published`,
`maturityProvisional: false`, `lastUpdated: "2026-07-02"`; `npm run build` passes; every
inline `[^id]` has a matching `sources` entry and vice-versa; every source URL verified with
WebFetch and given an `accessed:` date.

Reference example for quality bar: `caching-reuse/prompt-caching-prefix-caching.md`.

> Scorecard scales — Effort: Low/Med/High · Gain: Low/Med/High/Very High · Risk: Low/Med/High.
> Add `related:` cross-links (`<category>/<slug>`) — that's also how readers navigate.

---

## Visibility & Measurement — L2 (4)

### 1. quality-cost-evaluation-suite — Quality–Cost Evaluation Suite (L2 · visibility)
- **Scope:** an automated eval harness that scores **quality AND cost together** on a fixed
  test set, so every optimization (a cheaper model, a shorter prompt, fewer chunks) can be
  judged for regression before it ships. This is *the L2-defining investment* — it's the gate
  that makes every other L2/L3 cost move safe. Without it, right-sizing/routing/compression
  are guesses.
- **Key questions (primary sources):**
  1. What does a minimal quality-cost eval suite contain (golden set, task metrics, an
     LLM-as-judge or reference-based scorer, per-run cost/token capture)? Cite eval tooling
     docs (OpenAI Evals, Anthropic eval guidance, Braintrust, Langfuse/`promptfoo`, DeepEval).
  2. How is the **cost axis** wired in alongside quality (per-eval-case token+$ capture; the
     "quality per dollar" / cost-adjusted-score framing)?
  3. LLM-as-judge reliability caveats (bias, drift, need for a rubric + spot human checks) —
     be honest about where automated judging misleads.
  4. Why L2 not L1: it requires curating a representative set + defining a quality bar — real
     engineering, not a config toggle.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium** (enabler — unlocks safe
  savings elsewhere) · Risk **Low** (measuring can't hurt, but a bad judge misleads).
- **Detection signals (seed):** model/prompt changes shipped on vibes; no regression gate;
  "we tried a cheaper model but couldn't tell if quality dropped."
- **Measurement (seed):** eval coverage of real task types; cost-per-eval-case tracked;
  regressions caught pre-ship vs in production.
- **2026 freshness:** LLM-as-judge is now standard but needs rubric+calibration; "cost-adjusted
  quality" / cost-per-correct-answer is the metric that matters. Cross-link
  `cost-regression-tests` (this suite is what those tests run against) and `model-right-sizing`
  (right-sizing is only safe with this).
- **Target sources:** Braintrust/Langfuse/promptfoo/DeepEval docs, OpenAI Evals, an
  LLM-as-judge methods paper or provider eval guide.

### 2. cost-regression-tests — Cost Regression Tests (L2 · visibility)
- **Scope:** CI/CD gates that fail a build/PR when token usage or $/request for a representative
  workload rises beyond a threshold. The cost analogue of a performance regression test. Runs
  against the golden set from the eval suite.
- **Key questions:**
  1. How is a cost-regression check wired into CI (run N canonical prompts, sum tokens/$,
     compare to a committed baseline, fail on >X% increase)? Cite promptfoo assertions,
     Langfuse/Braintrust CI hooks, or a gateway's usage export.
  2. What triggers silent cost creep this catches (a prompt edit that bloats the system block,
     a model bump, an added tool description, a retrieval-k increase, reasoning-effort default
     change)?
  3. Baseline management: how to update baselines intentionally vs catch accidental drift.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (prevents regressions rather
  than cutting current spend) · Risk **Low**.
- **Detection signals (seed):** prompt/model changes land with no cost check; cost creeps up
  release over release; nobody owns "why did cost/request go up."
- **Measurement (seed):** cost-regression gate present in CI; % of prompt/model changes gated;
  cost-creep incidents caught pre-merge.
- **2026 freshness:** re-tiered L3→L2 (off-the-shelf CI eval tools make this L2 now).
  Cross-link `quality-cost-evaluation-suite` (shares the golden set) and `cost-anomaly-detection`
  (CI-time vs production-time detection).
- **Target sources:** promptfoo docs (assertions/CI), Langfuse/Braintrust CI integration docs,
  a practitioner write-up on LLM cost regressions.

### 3. cost-anomaly-detection — Cost Anomaly Detection (L2 · visibility)
- **Scope:** production-time alerting on abnormal spend — spikes, drift, a runaway loop, a
  single abusive key — before the monthly invoice. Distinct from `budget-limits-guardrails`
  (hard caps/stops) and `cost-regression-tests` (pre-ship CI). This is *detect + alert on live
  traffic*.
- **Key questions:**
  1. What signals define an anomaly (spend rate vs baseline, tokens/request distribution shift,
     cache-hit-rate collapse, per-key/per-feature spikes)? Cite Datadog LLM Observability
     monitors, Langfuse/Helicone alerting, cloud-cost anomaly tools (AWS Cost Anomaly Detection,
     CloudZero/Finout).
  2. Build-vs-buy: threshold alerts vs statistical/ML anomaly detection — where's the honest
     line for most teams (simple thresholds catch 90%)?
  3. What does it prevent that a hard cap doesn't (early warning before the cap; catching a
     slow drift a cap never trips)?
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (tail-risk + early warning) ·
  Risk **Low**.
- **Detection signals (seed):** cost surprises at invoice time; no alerting on spend rate; a
  bug once 5×'d the bill and nobody noticed for days.
- **Measurement (seed):** time-to-detect a cost anomaly; alerts configured per key/feature/model;
  false-positive rate.
- **2026 freshness:** re-tiered L3→L2. Cross-link `budget-limits-guardrails` (alert before cap),
  `cache-hit-rate-instrumentation` (a cache-hit collapse is a top anomaly), `token-cost-observability`.
- **Target sources:** Datadog LLM Obs monitors, AWS Cost Anomaly Detection docs, Langfuse/Helicone
  alerting, a cloud-FinOps anomaly guide.

### 4. cache-hit-rate-instrumentation — Cache-Hit-Rate Instrumentation (L2 · visibility)
- **Scope:** measure the hit rate (and $ saved) of every cache in the stack — prompt/prefix
  cache, exact cache, semantic cache, retrieval cache. You can't tune a cache you don't measure;
  a "cache" at 5% hit rate is theater. This is the measurement precondition for the whole
  caching category.
- **Key questions:**
  1. Where do the hit-rate numbers come from — provider usage objects expose cached tokens
     (`cache_read_input_tokens` / `prompt_tokens_details.cached_tokens`); how to derive hit rate
     and $ saved per call and in aggregate? Cite Anthropic + OpenAI usage-object docs.
  2. What hit-rate targets are realistic per cache type, and what a low rate diagnoses (unstable
     prefix, cache TTL too short, poor key design)?
  3. The ProjectDiscovery-style story: instrumentation revealed a 7%→84% prefix-cache-hit
     improvement (static-first/volatile-last) → ~59% cost cut. Use as the motivating example.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium** (enabler that turns caching
  from hope into a tuned system) · Risk **Low**.
- **Detection signals (seed):** caches deployed but hit rate unknown; no cached-token line in
  dashboards; "we added caching" with no before/after.
- **Measurement (seed):** hit rate + $ saved per cache reported; cached-token % of input tokens;
  trend over time.
- **2026 freshness:** provider usage objects now split cached tokens natively — instrumentation
  is mostly reading a field. Cross-link `prompt-caching-prefix-caching`, `cache-aware-agent-design`,
  `semantic-caching`, `cost-anomaly-detection`.
- **Target sources:** Anthropic prompt-caching usage docs, OpenAI prompt-caching/usage docs,
  Langfuse/Helicone cache metrics, the ProjectDiscovery case study.

---

## Model Choice & Routing — L2 (3)

### 5. provider-routing — Provider Routing (L2 · model-routing)
- **Scope:** route the *same* model/capability tier across multiple providers (OpenAI vs Azure
  OpenAI vs Bedrock vs Vertex vs open-weight hosts like Together/Fireworks/Groq/DeepSeek) to get
  the lowest price (and/or best latency/availability) for equivalent quality. Includes routing
  identical open-weight models to the cheapest host.
- **Key questions (primary sources):**
  1. Real price dispersion for the *same* open-weight model across hosts (Llama/Qwen/DeepSeek on
     Together vs Fireworks vs Groq vs DeepInfra) — quantify with current per-M pricing.
  2. Same-model-different-cloud (GPT via OpenAI vs Azure; Claude via Anthropic vs Bedrock vs
     Vertex) — price/rate-limit/region differences.
  3. Mechanism: gateways/routers that do this (OpenRouter, LiteLLM, Portkey, Bifrost) — how they
     abstract providers and pick on price/latency.
  4. Caveats: quality is NOT always identical across hosts (quantization, context limits,
     fingerprint drift); data-residency/compliance constraints.
- **Scorecard hypothesis:** Effort **Low–Medium** (gateway config) · Gain **Medium** (a slice off
  unit price, not an order of magnitude) · Risk **Low–Medium** (subtle quality/behavior variance
  across hosts).
- **Detection signals (seed):** single-provider lock-in; paying list price with no comparison;
  open-weight model pinned to one (pricier) host.
- **Measurement (seed):** blended $/token vs single-provider baseline; % traffic on
  cheapest-equivalent host; quality parity check across hosts.
- **2026 freshness:** distinguish from `dynamic-model-routing` (that routes across *capability
  tiers* by request difficulty; this routes across *providers* for the same tier). OpenRouter-style
  price routing is mainstream. Cross-link `fallback-routing` (same infra), `local-open-weight-substitution`.
- **Target sources:** OpenRouter/LiteLLM/Portkey docs + provider pricing pages (OpenAI, Azure,
  Bedrock, Vertex, Together, Fireworks, Groq, DeepSeek).

### 6. fallback-routing — Fallback Routing (L2 · model-routing)
- **Scope:** on primary failure/timeout/rate-limit, automatically retry on a backup
  model/provider. **Body MUST carry the cost framing** (per DECISIONS deep-pass): it's
  reliability-primary, but the *cost* angle is (a) run a cheap primary and only spill over to an
  expensive backup on failure, and (b) avoid the hidden cost of failed/dropped requests and manual
  retries. Don't write it as pure reliability.
- **Key questions:**
  1. How gateways implement fallback chains (LiteLLM `fallbacks`, Portkey/Bifrost fallback configs,
     OpenRouter) — order, triggers (5xx/429/timeout), and per-attempt billing.
  2. The cost design: cheap-primary + spillover-only-on-failure; how to avoid double-billing
     (you pay for the failed attempt's input tokens on some providers?) — verify.
  3. Where fallback *raises* cost if misconfigured (aggressive retries to a pricier model on
     transient blips; retry storms) — tie to `budget-limits-guardrails`.
- **Scorecard hypothesis:** Effort **Low** (gateway config) · Gain **Low–Medium** (avoided-failure
  cost + cheap-primary spillover) · Risk **Low**.
- **Detection signals (seed):** single point of failure; manual retries on outages; no defined
  backup; or over-eager retries inflating spend.
- **Measurement (seed):** % requests served by fallback; cost of fallback traffic; failed-request
  rate before/after.
- **2026 freshness:** frame the cost story explicitly (see above). Cross-link `provider-routing`,
  `budget-limits-guardrails`, `dynamic-model-routing`.
- **Target sources:** LiteLLM fallbacks docs, Portkey/Bifrost fallback docs, OpenRouter.

### 7. reasoning-token-budgeting — Reasoning / Thinking-Token Budgeting (L2 · model-routing)
- **Scope:** control the hidden **reasoning/thinking tokens** on reasoning models — set effort
  level (`reasoning_effort` low/med/high on OpenAI GPT-5.x/o-series; Anthropic extended-thinking
  `budget_tokens`; Gemini `thinking_budget`) or turn thinking off for easy tasks. Reasoning tokens
  are billed as (expensive) output and often dominate spend, yet `max_tokens` does NOT bound them.
- **Key questions (primary sources):**
  1. The exact knobs per provider and their effect on token count/cost/latency: OpenAI
     `reasoning_effort` (incl. `minimal`), Anthropic `thinking.budget_tokens`, Gemini
     `thinking_budget` (incl. 0 / dynamic -1). Cite each provider's docs.
  2. Magnitude: how much do reasoning tokens inflate cost, and how much does dropping effort
     save (with the accuracy tradeoff curve)? Find provider/independent numbers.
  3. Task-matching: which tasks need high reasoning vs which are wasted on it (simple
     extraction/classification/format should be minimal/off).
  4. Interaction with `max_tokens`: max_tokens caps *visible* output but reasoning tokens are
     billed separately — a request can burn the whole budget on thinking and return nothing.
- **Scorecard hypothesis:** Effort **Low** (a parameter) · Gain **High** (reasoning tokens are
  often the dominant output cost) · Risk **Medium** (too-low effort degrades hard-task accuracy).
- **Detection signals (seed):** reasoning model used for trivial tasks at default/high effort;
  huge output-token bills with short visible answers; thinking on for classification.
- **Measurement (seed):** reasoning-token % of output tokens; $/request by effort level; accuracy
  held at bar per effort tier.
- **2026 freshness:** central 2026 lever. Cross-link `output-length-control` (visible vs hidden
  output), `max-token-policies` (doesn't bound reasoning), `model-right-sizing`, output category
  broadly. GPT-5 exposes `minimal`; Gemini 2.5 exposes dynamic thinking.
- **Target sources:** OpenAI reasoning docs (reasoning_effort), Anthropic extended-thinking docs,
  Google Gemini thinking-budget docs, an independent accuracy-vs-effort eval.

---

## Prompt & Context Optimization — L2 (4)

### 8. few-shot-example-pruning — Few-Shot Example Pruning (L2 · prompt-context)
- **Scope:** cut the number (and length) of in-context examples to the minimum that holds
  quality — every few-shot example is input tokens paid on *every* call. Includes dropping
  examples entirely where instructions + a schema suffice.
- **Key questions:**
  1. Evidence that many prompts carry redundant/excess few-shots; how to prune empirically
     (ablate examples against the eval suite, keep the marginal-value ones).
  2. The 2026 shift: reasoning/instruction-following models often need **fewer or zero**
     few-shots (sometimes many-shot *hurts*) — cite provider guidance (Anthropic/OpenAI say
     modern models need fewer examples) and any study.
  3. Where few-shots still earn their tokens (format-locking, rare/edge classes, style transfer).
- **Scorecard hypothesis:** Effort **Low–Medium** (needs eval to prune safely) · Gain
  **Medium** (per-call input savings, compounding at volume) · Risk **Medium** (over-pruning drops
  edge-case accuracy).
- **Detection signals (seed):** long static example blocks never revisited; 10+ few-shots on a
  reasoning model; examples duplicating what the schema/instructions already say.
- **Measurement (seed):** input tokens/call before/after; quality held at bar with fewer examples.
- **2026 freshness:** reasoning models need fewer/zero few-shots — lead with this. Cross-link
  `prompt-cleanup` (remove waste), `dynamic-few-shot-selection` (L3 — retrieve only relevant
  examples per query), `quality-cost-evaluation-suite` (the gate).
- **Target sources:** Anthropic/OpenAI prompting guides on example count, a many-shot vs few-shot
  study, provider docs on reasoning-model prompting.

### 9. structured-context-packing — Structured Context Packing (L2 · prompt-context)
- **Scope:** organize the context you *do* send so the model uses fewer tokens and attends better
  — model-appropriate delimiters/format, ordering (stable-first/volatile-last for cache),
  deduplication of restated info, tight schemas. It's about *how* context is laid out, not *how
  much* (that's budgeting/pruning).
- **Key questions:**
  1. Model-specific format guidance (**XML tags for Claude, Markdown/headers for GPT-5**, JSON
     where parsing matters) — cite provider prompt guides; does format measurably change
     token count / quality?
  2. Ordering for cache efficiency (static system/tools first, volatile user data last) — ties to
     prefix caching.
  3. Concrete packing tactics: dedupe repeated context, use references/IDs instead of re-pasting,
     compact tables over prose, drop redundant delimiters.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium** · Risk **Low**.
- **Detection signals (seed):** ad-hoc prompt formatting; same context pasted multiple times;
  volatile data interleaved with static (killing cache); wrong-model format conventions.
- **Measurement (seed):** input tokens/call; prefix-cache hit rate; quality at bar.
- **2026 freshness:** model-specific format guidance (XML/Claude vs Markdown/GPT-5). Cross-link
  `prompt-caching-prefix-caching`, `prompt-modularization`, `context-window-budgeting`.
- **Target sources:** Anthropic prompt-engineering (XML) docs, OpenAI GPT-5 prompting guide,
  provider structure/format guidance.

### 10. context-window-budgeting — Context Window Budgeting (L2 · prompt-context)
- **Scope:** set an explicit per-call token budget and allocate it across components (system,
  history, retrieved docs, tools) with hard limits + a trimming policy — instead of letting
  context grow until it hits the model max. Prevents the "just stuff the window" default that is
  the biggest input-cost driver.
- **Key questions:**
  1. How to budget: a token accounting per component + a trimming/eviction policy (drop oldest
     turns, cap retrieved-k, summarize when over budget). Cite framework mechanisms
     (LangChain/LlamaIndex token-limit memory, provider guidance).
  2. Why "bigger context window ≠ use it all": long-context cost scales with tokens, and quality
     degrades ("lost in the middle") — cite the long-context degradation literature.
  3. The relationship to caching (a stable budgeted prefix caches; an unbounded growing context
     doesn't).
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (caps the dominant input
  cost) · Risk **Low–Medium** (over-aggressive trimming drops needed context).
- **Detection signals (seed):** context grows unbounded per turn; no per-component token caps;
  requests occasionally near model max; cost scales with conversation length.
- **Measurement (seed):** tokens/call distribution + p95; % of calls near budget; cost per
  conversation.
- **2026 freshness:** cross-link `long-context-avoidance` (L1), `conversation-summarization` (L3,
  a trimming policy), `structured-context-packing`, `reducing-retrieved-chunk-count`.
- **Target sources:** "lost in the middle" long-context paper, LangChain/LlamaIndex memory/token
  docs, provider long-context pricing.

### 11. provider-native-context-management — Provider-Native Context Management (L2 · prompt-context)
- **Scope:** use the *built-in* context tools providers now ship — **Anthropic context editing
  (auto-clearing stale tool results) + the memory tool**, OpenAI/others' equivalents — to shrink
  long-running context by configuration instead of building your own pruning/summarization
  pipeline. The "buy" path; the L3 trio (pruning/offloading/summarization) is the "build" path.
- **Key questions (primary sources):**
  1. What Anthropic context editing does and its measured effect — cite the **~84% token
     reduction** figure from Anthropic's context-management announcement; how the memory tool
     offloads state outside the window.
  2. Equivalent native features on other providers (OpenAI Responses API state / conversation
     management; Gemini context caching-as-management) — what's actually "native management" vs
     just caching.
  3. Config vs build tradeoff: when the native tool suffices vs when you need the L3 custom path.
- **Scorecard hypothesis:** Effort **Low** (config/API adoption) · Gain **Medium–High** (large
  token cuts on long agent runs) · Risk **Low–Medium** (auto-clearing can drop something needed).
- **Detection signals (seed):** long agent/chat sessions with growing tool-result history;
  building custom summarization when a native tool exists; tool outputs never cleared.
- **Measurement (seed):** tokens/turn over a long session before/after; % token reduction.
- **2026 freshness:** ADD'd in deep-pass; ~84% figure. Cross-link the L3 build trio
  (`context-pruning`, `context-offloading`, `conversation-summarization`),
  `state-compression-for-agents`, `reusable-memory-artifact-store`.
- **Target sources:** Anthropic context-editing + memory-tool docs/announcement (the 84% figure),
  OpenAI Responses API state docs, Gemini context docs.

---

## Caching & Reuse — L2 (3)

### 12. exact-response-caching — Exact Response Caching (L2 · caching-reuse)
- **Scope:** cache the full model response keyed on an exact (normalized) request — identical
  prompt+params → return the stored answer, zero model call. Re-tiered L1→L2 because doing it
  *correctly* (TTL/expiration/invalidation, key normalization, staleness) is real engineering,
  not a dict lookup.
- **Key questions:**
  1. Key design: what to hash (prompt + model + params + tool defs), normalization (whitespace,
     ordering), and why over-broad keys serve wrong answers.
  2. **TTL/expiration/invalidation** (the reason it's L2): when a cached answer goes stale
     (data changed, prompt changed, model changed), eviction strategies, versioned keys.
  3. Where exact caching hits (deterministic/`temperature=0` tasks, FAQ, repeated identical
     queries, idempotent tool prompts) vs where hit rate is ~0 (open-ended chat, high-entropy
     inputs) — that's the bridge to semantic caching (L3).
  4. Build-vs-buy: DIY Redis/KV vs gateway response cache (Portkey/LiteLLM/Cloudflare AI Gateway).
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium–High** where hit rate is real
  (100% savings on a hit) · Risk **Medium** (stale/wrong cached answers if invalidation is sloppy).
- **Detection signals (seed):** identical requests re-billed; no cache layer; deterministic
  endpoints paying per call; FAQ/support answers regenerated.
- **Measurement (seed):** hit rate + $ saved (see `cache-hit-rate-instrumentation`); stale-answer
  incidents.
- **2026 freshness:** lead with TTL/invalidation correctness. Cross-link `semantic-caching` (L3 —
  fuzzy matches), `cache-invalidation-strategies` (L3), `cache-hit-rate-instrumentation`,
  `prompt-caching-prefix-caching` (different mechanism — token-level vs response-level).
- **Target sources:** Portkey/LiteLLM/Cloudflare AI Gateway cache docs, a caching-correctness/TTL
  reference, Redis caching patterns.

### 13. embedding-caching — Embedding Caching (L2 · caching-reuse)
- **Scope:** cache embedding vectors keyed by (text hash + model) so you never re-embed the same
  text — for both ingestion (re-indexing unchanged docs) and query-time (repeated queries). The
  cost lever is embedding-API calls / GPU embedding compute.
- **Key questions:**
  1. Where re-embedding waste comes from (full re-index on every deploy, re-embedding unchanged
     chunks, embedding the same query repeatedly) and typical savings.
  2. Key design: content hash + model + model-version (embeddings are not comparable across model
     versions — invalidation on model change is mandatory).
  3. Mechanism: framework caches (LangChain `CacheBackedEmbeddings`), a KV/Redis store, or the
     vector DB itself as the cache.
  4. Cost context: embedding calls are cheap per unit but high volume — quantify at RAG scale.
- **Scorecard hypothesis:** Effort **Low** · Gain **Low–Medium** (embeddings are cheap per token;
  matters at high re-index volume) · Risk **Low** (must invalidate on model-version change).
- **Detection signals (seed):** full re-embed on every deploy/index rebuild; no content-hash
  dedupe; same query embedded repeatedly.
- **Measurement (seed):** embedding calls avoided; $/re-index before/after; cache hit rate.
- **2026 freshness:** honest framing — this is a modest lever vs generation caching, real at
  ingestion scale. Cross-link `retrieval-result-caching` (L3), `specialized-embedding-models`,
  `embedding-quantization-mrl`.
- **Target sources:** LangChain CacheBackedEmbeddings docs, OpenAI/Cohere/Voyage embedding pricing,
  a RAG-ingestion cost write-up.

### 14. summary-caching — Summary Caching (L2 · caching-reuse)
- **Scope:** compute a summary of a document/conversation/thread **once**, cache it, and reuse it
  in place of the full text on subsequent calls — paying the summarization cost once instead of
  re-sending (or re-summarizing) the full content every time. **Frame DIY vs managed**: the DIY
  cache vs the provider-native **compaction** path (Anthropic Compaction API + memory tool).
- **Key questions:**
  1. The pattern: summarize-once-reuse-many (long docs reused across queries; conversation
     history compacted into a rolling summary). Where the break-even is (reuse count × full-text
     token cost > one summarization cost).
  2. Provider-native "compaction" (Anthropic) as the managed alternative — what it does, when to
     use it vs a DIY summary cache.
  3. Invalidation: when the underlying doc/conversation changes, the cached summary is stale.
  4. Quality risk: a cached summary loses detail — where that's fatal (legal/medical exact terms).
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (big on high-reuse long content) ·
  Risk **Medium** (summary omits detail; staleness).
- **Detection signals (seed):** same long doc re-sent full-text across many queries; conversation
  history re-sent verbatim each turn; no rolling summary.
- **Measurement (seed):** tokens/call on reused content before/after; summary reuse count;
  quality at bar.
- **2026 freshness:** "compaction" is the standard term. Cross-link `conversation-summarization`
  (L3 — the rolling-summary technique), `provider-native-context-management`,
  `precomputed-document-summaries` (RAG L3), `cache-invalidation-strategies`.
- **Target sources:** Anthropic compaction/memory docs, a summarize-once RAG pattern write-up,
  provider summarization guidance.

---

## Batching & Async — L2 (1)

### 15. bulk-extraction-classification — Bulk Extraction / Classification Pipelines (L2 · batching-async)
- **Scope:** high-volume structured tasks (extraction, classification, tagging, enrichment) run
  as an offline/async pipeline — combining Batch-API discounts, **multi-item prompt batching**
  (N items per call, the folded-in mechanism), a small/right-sized model, and structured outputs.
  The archetypal "cheap at scale" L2 workload.
- **Key questions:**
  1. **Multi-item prompt batching** (the mechanism folded in here): process N items in one prompt
     to amortize system-prompt/instruction overhead — quantify the per-item token savings and the
     accuracy ceiling (where too many items per call degrades quality).
  2. Stacking discounts: Batch API (~50% off) + prompt caching on the shared instruction prefix +
     a cheap model — how they compound (cite `batch-api-usage`).
  3. Structured outputs + a small model for extraction/classification (ties to
     `model-right-sizing`, `structured-outputs`, and L3 `task-specific-classifiers/extractors` as
     the next tier).
  4. Failure/validation handling at scale (schema validation, retry only failures).
- **Scorecard hypothesis:** Effort **Medium** · Gain **High** (discount stacking + amortized
  overhead + small model at volume) · Risk **Medium** (multi-item quality ceiling; extraction
  errors at scale).
- **Detection signals (seed):** one API call per item for a large corpus; flagship model on
  classification; no batching/no structured output; synchronous processing of offline work.
- **Measurement (seed):** $/1k items before/after; items/call; per-item accuracy at bar.
- **2026 freshness:** multi-item batching folded in as the mechanism. Cross-link `batch-api-usage`,
  `model-right-sizing`, `structured-outputs`, `task-specific-classifiers`, `task-specific-extractors`.
- **Target sources:** OpenAI/Anthropic Batch API docs + pricing, a multi-item-prompt-batching
  study/write-up, structured-output docs.

---

## RAG-Specific Optimization — L2 (3)

### 16. chunking-parameter-tuning — Chunking-Parameter Tuning (L2 · rag)
- **Scope:** tune chunk size, overlap, and boundary strategy (fixed / recursive / semantic) so
  retrieval returns fewer, denser, more relevant chunks — cutting the tokens fed to the LLM per
  query. Re-tiered L1→L2 because doing it right is **eval-driven** (measure retrieval + answer
  quality across configs). Absorbs chunk-overlap + semantic-chunking.
- **Key questions:**
  1. How chunk size/overlap affect retrieved-token volume AND answer quality — cite chunking
     benchmarks/guides (LlamaIndex/LangChain, Pinecone/Chroma, an eval study). No universal best;
     it's dataset-dependent → hence eval-driven → hence L2.
  2. Overlap's cost: overlap duplicates tokens across chunks (inflates both index and retrieved
     tokens) — where the overlap is worth it vs waste.
  3. Semantic vs fixed chunking: does semantic chunking's extra cost pay off? (Be honest —
     evidence is mixed.)
  4. The eval loop: how to tune against a retrieval-quality + answer-quality metric.
- **Scorecard hypothesis:** Effort **Medium** (eval-driven) · Gain **Medium** (fewer/denser
  retrieved tokens) · Risk **Medium** (bad chunking hurts retrieval recall).
- **Detection signals (seed):** default chunk size never tuned; huge overlap; oversized chunks
  padding context; retrieval quality never measured.
- **Measurement (seed):** retrieved tokens/query; retrieval recall/precision + answer quality at
  bar across configs.
- **2026 freshness:** eval-driven tuning (re-tier rationale). Cross-link `reducing-retrieved-chunk-count`
  (L1), `retrieval-chunk-deduplication`, `reranking-before-generation`, `quality-cost-evaluation-suite`.
- **Target sources:** LlamaIndex/LangChain chunking docs, a chunking-strategy benchmark, Pinecone/
  Chroma chunking guide, a semantic-chunking eval.

### 17. reranking-before-generation — Reranking Before Generation (L2 · rag)
- **Scope:** over-retrieve then use a cross-encoder/reranker to keep only the top-k most relevant
  chunks fed to the (expensive) LLM — fewer generation-context tokens at equal or better answer
  quality. Absorbs multi-stage-retrieval.
- **Key questions:**
  1. The cost mechanism: retrieve 50, rerank, pass top 3–5 → far fewer LLM-context tokens; the
     reranker is cheap relative to LLM generation. Quantify token reduction + the reranker's own
     cost.
  2. Reranker options and pricing (Cohere Rerank, Voyage rerank, Jina, BGE cross-encoders
     self-hosted) — API vs self-hosted cost.
  3. Multi-stage retrieval (folded in): cheap dense retrieve → rerank → generate; the cascade.
  4. Where reranking doesn't pay (already-small candidate sets; latency-critical paths; when
     top-k recall is already high).
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (large generation-token cut
  by dropping irrelevant chunks) · Risk **Low–Medium** (a bad reranker drops the needed chunk).
- **Detection signals (seed):** top-k chunks passed straight to the LLM with no relevance filter;
  large k "to be safe"; irrelevant chunks in context.
- **Measurement (seed):** generation-context tokens/query before/after; answer quality at bar;
  reranker cost vs LLM savings.
- **2026 freshness:** absorbs multi-stage-retrieval. Cross-link `reducing-retrieved-chunk-count`,
  `chunking-parameter-tuning`, `retrieval-chunk-deduplication`, `contextual-compression` (L4).
- **Target sources:** Cohere Rerank docs+pricing, Voyage/Jina rerank docs, a rerank-improves-RAG
  study, BGE reranker repo.

### 18. retrieval-chunk-deduplication — Retrieval-Time Chunk Deduplication (L2 · rag)
- **Scope:** remove near-duplicate / highly-overlapping retrieved chunks *before* they hit the LLM
  — dedupe by exact match, hash, or embedding-similarity threshold — so you don't pay to send the
  same information three times. ADD'd in deep-pass.
- **Key questions:**
  1. Where duplicate chunks come from (overlapping chunks from `chunking` overlap, the same
     passage indexed in multiple docs, boilerplate repeated across pages) and how much context
     they waste.
  2. Dedup methods: exact/hash, MinHash/near-dup, embedding cosine-similarity threshold, MMR
     (maximal marginal relevance) at retrieval — tradeoffs and cost.
  3. Risk: over-aggressive dedup drops a chunk that was similar-but-distinct.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Low–Medium** (context token savings;
  bigger when overlap/duplication is high) · Risk **Low–Medium**.
- **Detection signals (seed):** retrieved chunks with visibly repeated text; high chunk overlap;
  same source passage appearing multiple times in context.
- **Measurement (seed):** duplicate-token % in retrieved context; retrieved tokens/query
  before/after; answer quality at bar.
- **2026 freshness:** ADD'd L2. Cross-link `chunking-parameter-tuning` (overlap is a dup source),
  `reranking-before-generation`, `reducing-retrieved-chunk-count`.
- **Target sources:** MMR retrieval docs (LangChain/LlamaIndex), a near-duplicate detection
  reference, a RAG-context-dedup write-up.

---

## Output Optimization — L2 (3)

### 19. streaming-with-early-stop — Streaming With Early Stop (L2 · output)
- **Scope:** stream the response and **stop generation as soon as the needed content is produced**
  — via stop sequences, client-side cancellation when a parser has enough, or detecting the answer
  boundary — so you don't pay for tokens after the useful answer. Cost lever = output tokens not
  generated.
- **Key questions:**
  1. Mechanisms: `stop` sequences, server-side stop tokens, client abort/cancel on a streamed
     connection — does cancelling actually stop billing? (Verify per provider: you're billed for
     tokens generated up to cancellation.)
  2. Use cases where early-stop saves real tokens (extract-first-then-stop, "answer then stop
     before justification," structured generation where the object is complete).
  3. The reasoning-model caveat: streaming/early-stop applies to *visible* output; reasoning
     tokens are already spent before streaming begins — limited leverage there.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Low–Medium** (trims output-token tail;
  bigger on verbose formats) · Risk **Low** (mostly a UX/latency win with a cost side-benefit).
- **Detection signals (seed):** full generation always run then truncated client-side; no stop
  sequences; paying for trailing boilerplate/justifications the client ignores.
- **Measurement (seed):** output tokens/request before/after; tokens-after-answer saved.
- **2026 freshness:** honest framing — often more a latency/UX win than a big cost cut; reasoning
  caveat. Cross-link `output-length-control`, `max-token-policies`, `reasoning-token-budgeting`,
  `structured-outputs`.
- **Target sources:** OpenAI/Anthropic streaming + stop-sequence docs, provider billing note on
  cancellation, a streaming-cost write-up.

### 20. template-plus-fill — Template-Plus-Fill Generation (L2 · output)
- **Scope:** generate only the *variable* fields and drop them into a fixed template, instead of
  having the LLM regenerate the whole boilerplate document every time. The model emits a small
  structured payload; deterministic code renders the rest. Cost lever = output tokens (and often
  input) not generated.
- **Key questions:**
  1. The pattern: fixed template (code-owned) + LLM fills slots (often via structured outputs) →
     the LLM writes 50 tokens instead of 800. Quantify on a realistic doc (email, report, product
     description).
  2. Where it fits (repetitive structured docs: emails, summaries with fixed sections, product
     copy, reports) vs where it doesn't (genuinely free-form generation).
  3. Relationship to `structured-outputs` (the delivery mechanism) and `post-processing` (the
     next tier of "let code do it, not the LLM").
- **Scorecard hypothesis:** Effort **Medium** (build templates + slot schema) · Gain
  **Medium–High** (large output-token cut on boilerplate-heavy docs) · Risk **Low** (template is
  deterministic; only slot content is model-generated).
- **Detection signals (seed):** LLM regenerates identical boilerplate every call; long outputs
  that are 80% fixed structure; templated docs generated free-form.
- **Measurement (seed):** output tokens/doc before/after; % of output that was boilerplate.
- **2026 freshness:** cross-link `structured-outputs`, `post-processing-instead-of-generation`,
  `output-length-control`.
- **Target sources:** structured-output docs, a template-fill/LLM-slot-filling pattern write-up,
  a report-generation cost example.

### 21. post-processing-instead-of-generation — Post-Processing Instead of Generation (L2 · output)
- **Scope:** move deterministic work OUT of the LLM into code — formatting, sorting, arithmetic,
  date math, unit conversion, string manipulation, dedup — instead of asking the model to do (and
  emit tokens for) what code does perfectly and free. Absorbs deterministic-formatting; can reach
  L3 for sophisticated pipelines.
- **Key questions:**
  1. Catalogue of "don't make the LLM do this" tasks (formatting/markdown, sorting/filtering,
     math, date/currency, JSON shaping, capitalization) — each is output tokens + error risk you
     can delete.
  2. The reliability angle: code is deterministic and correct; LLMs make arithmetic/format errors
     — so this cuts cost AND raises quality (double win).
  3. The boundary: what MUST stay in the LLM (judgment, language) vs what's mechanical → code.
     Where sophisticated post-processing pipelines push this to L3.
- **Scorecard hypothesis:** Effort **Low–Medium** · Gain **Medium** · Risk **Low** (code is more
  reliable than the LLM for these).
- **Detection signals (seed):** LLM asked to sort/format/compute; model doing arithmetic; output
  parsing/reformatting that code could do; LLM emitting large formatted blocks.
- **Measurement (seed):** output tokens/request before/after; error rate on mechanical tasks
  (should drop to ~0 in code).
- **2026 freshness:** double-win framing (cost + reliability). Cross-link `template-plus-fill`,
  `structured-outputs`, `output-length-control`.
- **Target sources:** provider guidance on offloading deterministic work, a "let code do it"
  engineering write-up, structured-output docs.

---

## Agent & Workflow Optimization — L2 (2)

### 22. tool-use-minimization — Tool-Use Minimization (L2 · agent-workflow)
- **Scope:** reduce the token cost of tools in an agent — trim tool *count* and tool *description*
  bloat, and load tools **lazily**. Absorbs **deferred-tool-loading** (dynamic tool retrieval —
  solves the 100k+ token MCP-init tax when every tool schema is loaded up front) AND **agent-skill
  lazy-loading** as advanced sections.
- **Key questions (primary sources):**
  1. The MCP init tax: how many input tokens large tool/skill catalogs add to *every* agent step
     (all tool schemas resent each turn) — quantify (100k+ token cases).
  2. **Deferred / dynamic tool loading**: retrieve only the tools relevant to the current step
     instead of loading all — cite the mechanism (Anthropic tool-search / MCP dynamic discovery,
     or a framework's dynamic tool selection). Report token savings.
  3. Tool-description dieting: verbose schemas/descriptions are resent every turn; how to trim.
  4. **Agent-skill lazy-loading**: load skill instructions only when invoked.
  5. Fewer tools also improves selection accuracy (double win).
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (tool schemas are resent every
  step → compounding input cost) · Risk **Low–Medium** (a needed tool not loaded fails a step).
- **Detection signals (seed):** dozens of tools/all MCP servers loaded on every request; long
  static tool-schema block; input tokens dominated by tool defs; skills all loaded up front.
- **Measurement (seed):** tool-definition tokens per step; input tokens/step before/after; tool
  count per request; selection accuracy.
- **2026 freshness:** deferred-tool-loading + skill lazy-loading are the 2026 mechanisms. Cross-link
  `programmatic-tool-calling` (L4 — the bigger fix), `agent-budget-guardrails`,
  `provider-native-context-management`, `state-compression-for-agents`.
- **Target sources:** Anthropic tool-use / tool-search / MCP docs, a dynamic-tool-loading write-up,
  an MCP-token-tax analysis.

### 23. human-in-the-loop-checkpoints — Human-in-the-Loop Checkpoints (L2 · agent-workflow)
- **Scope:** insert human approval gates before expensive/irreversible agent actions (a long
  autonomous run, a costly tool call, a big generation) so the agent doesn't burn tokens (or take
  bad actions) without a cheap human confirm. Absorbs expensive-action-confirmation. Cost lever =
  avoided wasted agent work + avoided rework.
- **Key questions:**
  1. Where checkpoints save cost: gate the *start* of an expensive run (confirm scope), gate
     mid-run before a costly branch, gate before irreversible/expensive tool calls. Cite agent
     framework HITL patterns (LangGraph `interrupt`/human-in-the-loop, provider agent docs).
  2. The economics: a human "yes/no" is ~free vs a wasted multi-step autonomous run; quantify a
     runaway-agent avoided-cost example.
  3. Boundary with `agent-scope-confirmation` (product-ux — confirm the plan/clarifying-Q up
     front) and `agent-budget-guardrails` (automated in-loop limits) — HITL is the human gate.
  4. Cost of the checkpoint itself (latency, human time) — where it's worth it vs friction.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (avoids wasted autonomous spend +
  rework) · Risk **Low** (mostly upside; adds latency/friction).
- **Detection signals (seed):** agents run long autonomous chains with no gate; expensive/
  irreversible actions taken without confirm; costly reruns after a wrong turn.
- **Measurement (seed):** wasted-run cost avoided; % of expensive actions gated; rework rate.
- **2026 freshness:** cross-link `agent-scope-confirmation` (product-ux L2), `agent-budget-guardrails`
  (L1), `workflow-decomposition` (L3).
- **Target sources:** LangGraph human-in-the-loop / interrupt docs, provider agent HITL guidance,
  an agent-cost-control write-up.

---

## Product & UX-Level Optimization — L2 (4)

### 24. user-controlled-quality-mode — User-Controlled Quality Mode (L2 · product-ux)
- **Scope:** expose a quality/speed/cost choice to the user (fast-cheap vs deep-expensive — e.g.
  a "quick answer" vs "deep research" toggle) so expensive models/effort are pulled only when the
  user actually wants them. Folds in **cheap-preview-then-commit** (a two-stage variant: show a
  cheap preview, let the user commit to the expensive full run).
- **Key questions:**
  1. Real product patterns (ChatGPT/Claude/Perplexity fast-vs-thinking modes, "deep research"
     buttons, model pickers) and the cost logic — most requests take the cheap default.
  2. **Cheap-preview-then-commit** (folded): generate a cheap preview/outline; user commits to the
     expensive full generation only if the preview looks right → avoids paying full price for
     unwanted outputs. Quantify the waste avoided.
  3. Design: sensible cheap default, clear value framing for the expensive mode, avoiding
     choice-overload.
  4. Ties to `reasoning-token-budgeting` / `model-right-sizing` (the mode maps to model/effort).
- **Scorecard hypothesis:** Effort **Medium** (UX + wiring) · Gain **Medium–High** (most traffic
  stays on the cheap path) · Risk **Low** (user chose it) — but a bad default undermines savings.
- **Detection signals (seed):** every user gets the max-quality/expensive path by default; no
  fast/cheap option; users pay for depth they didn't want; expensive outputs discarded.
- **Measurement (seed):** % traffic on cheap default vs expensive mode; $/request blended; preview
  commit rate.
- **2026 freshness:** cheap-preview-then-commit folded in. Cross-link `reasoning-token-budgeting`,
  `model-right-sizing`, `ai-feature-gating`, `cost-aware-product-tiers` (L3).
- **Target sources:** product docs/blogs on fast-vs-deep modes, a two-stage-generation UX write-up,
  provider model-picker guidance.

### 25. ai-non-ai-hybrid-ux — AI / Non-AI Hybrid UX (L2 · product-ux)
- **Scope:** use deterministic / non-LLM solutions (rules, templates, search, autocomplete,
  classical ML, cached canned responses) for the parts of a flow that don't need generative AI —
  reserve the expensive LLM for the parts that genuinely do. The cost lever is *not calling the
  LLM at all* for a large share of interactions.
- **Key questions:**
  1. Patterns: intent/keyword routing to a canned answer or search before invoking the LLM;
     buttons/forms instead of free-text where possible; classical ML classifier as a pre-filter;
     autocomplete/templates for structured input.
  2. Evidence/examples of "we replaced X% of LLM calls with a rule/search" and the savings.
  3. Where the LLM is genuinely required (open-ended reasoning, language generation) vs where a
     cheaper deterministic path wins on cost AND latency AND reliability.
  4. Guardrail: don't degrade UX by forcing rigid flows where users expect natural language.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (eliminates a share of LLM
  calls entirely) · Risk **Low–Medium** (over-rigid non-AI paths hurt UX).
- **Detection signals (seed):** LLM invoked for tasks a rule/search/lookup handles; every
  interaction hits the model; deterministic FAQs answered by generation.
- **Measurement (seed):** % of interactions served without an LLM call; $/session; deflection rate.
- **2026 freshness:** cross-link `ai-feature-gating` (L1), `precomputed-content-surfacing`,
  `post-processing-instead-of-generation`, `task-specific-classifiers` (L3).
- **Target sources:** product-engineering write-ups on hybrid AI UX, a "don't use an LLM for this"
  reference, deflection/automation case studies.

### 26. precomputed-content-surfacing — Precomputed Content Surfacing (L2 · product-ux)
- **Scope:** precompute expensive AI outputs for **predictable/popular** requests ahead of time
  (offline/batch) and surface the stored result at request time — instead of generating live per
  user. Renamed from precomputed-pregeneration. Cost lever = shifting from per-request live
  generation to amortized batch generation (+ often Batch-API discounts).
- **Key questions:**
  1. When precompute wins: high request-concentration (many users hit the same/similar content —
     top products, common queries, daily digests, category pages) → generate once offline, serve
     N times.
  2. Mechanism: batch-generate offline (ties to `batch-api-usage` for the discount), store, serve;
     freshness/invalidation policy (stale precomputed content).
  3. Break-even: precompute pays when (serves × live-cost) > (precompute-cost × content-count);
     where the long tail makes precompute wasteful.
  4. Distinction from caching (caching is reactive/on-demand; this is proactive/predictive).
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (on high-concentration
  content) · Risk **Low–Medium** (staleness; precomputing rarely-viewed content is waste).
- **Detection signals (seed):** same popular content generated live per user; predictable daily/
  category content generated on demand; high request concentration with no precompute.
- **Measurement (seed):** % requests served from precomputed store; $/request blended; precompute
  hit rate vs waste (unused precomputed items).
- **2026 freshness:** cross-link `batch-api-usage`, `exact-response-caching`, `pre-generation`
  (batching L3 infra), `ai-non-ai-hybrid-ux`.
- **Target sources:** a precompute/pregeneration architecture write-up, Batch API docs, a
  content-caching/CDN-for-AI pattern.

### 27. agent-scope-confirmation — Agent Scope / Plan Confirmation (L2 · product-ux)
- **Scope:** before kicking off an expensive agent run, have the agent (a) ask a clarifying
  question when the request is ambiguous, and/or (b) present its plan for user confirmation —
  so it doesn't burn a long autonomous run on the wrong interpretation. ADD'd in deep-pass. Cost
  lever = avoided wasted/wrong-direction agent spend.
- **Key questions:**
  1. The pattern: cheap clarifying-question / plan-preview step (a few hundred tokens) gates a
     multi-step autonomous run (thousands–millions of tokens). Quantify the asymmetry with a
     realistic agent example.
  2. Evidence: agents that clarify-first or plan-first waste less (cite agent-design guidance —
     Anthropic/OpenAI agent best-practices on planning + clarification).
  3. Design boundary vs `human-in-the-loop-checkpoints` (agent-workflow — mid-run approval gates)
     and `user-controlled-quality-mode` — this is the *up-front scope/plan* gate.
  4. Where it adds friction not worth it (cheap/fast tasks where a wrong guess is cheap to redo).
- **Scorecard hypothesis:** Effort **Low–Medium** (a prompt/flow step) · Gain **Medium** (avoids
  whole wrong-direction runs) · Risk **Low** (mostly upside; slight friction).
- **Detection signals (seed):** agents launch long runs on ambiguous prompts; frequent "that's not
  what I meant" reruns; no plan-preview/clarify step.
- **Measurement (seed):** rerun/wrong-direction rate; wasted-run cost avoided; clarify/confirm rate.
- **2026 freshness:** ADD'd L2. Cross-link `human-in-the-loop-checkpoints`, `user-controlled-quality-mode`,
  `agent-budget-guardrails`, `workflow-decomposition` (L3).
- **Target sources:** Anthropic/OpenAI agent best-practices (planning, clarification), a
  clarify-before-acting agent write-up.

---

## Execution notes (for the fan-out)

- One subagent per technique. Each reads: its brief above, `docs/TEMPLATE.md`, the reference
  page `src/content/techniques/caching-reuse/prompt-caching-prefix-caching.md`, and the relevant
  DECISIONS.md notes.
- Deep-research with primary sources; **WebFetch-verify every URL** and set `accessed: "2026-07-02"`.
- Write directly to `src/content/techniques/<category>/<slug>.md` (overwrite the stub). Keep the
  frontmatter schema exactly (see `src/content.config.ts`): `status: published`,
  `maturityProvisional: false`, `lastUpdated: "2026-07-02"`, filled scorecard + detectionSignals +
  measurementMethods + `related` + structured `sources`.
- Footnote/source sync is mandatory: every inline `[^id]` ↔ a `sources` entry with the same id.
- Do NOT touch `taxonomy.mjs` or any other technique's file.
