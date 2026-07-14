# Wave 3 research briefs — Highly Optimized (L3)

**Scope:** the **28 Level-3 techniques** — "custom systems and specialized models." L3 is where
cost work stops being off-the-shelf config and becomes real engineering investment: dynamic
routers, semantic caches, compression pipelines, fine-tuned task models, agent state systems.
Meaningful build effort, strong ROI **at scale**. A client reaches L3 once the L2 measurement +
eval foundation (Wave 2) is solid.

**How to use a brief:** it's the spec the research executes against. Resolve the **Key questions**
against primary sources, confirm/adjust the **Scorecard hypothesis**, fold in the **2026 freshness**
notes, then fill the page per `docs/TEMPLATE.md` (4 body sections + frontmatter scorecard +
detection signals + measurement + structured `sources`).

**Definition of done** (per `docs/RESEARCH_PLAN.md`): all 4 body sections written with concrete
detail; **≥5 quality sources** with primaries for every number; scorecard + detection signals +
measurement filled and defensible; `status: published`, `maturityProvisional: false`,
`lastUpdated: "2026-07-03"`; `npm run build` passes; every inline `[^id]` has a matching `sources`
entry and vice-versa; every source URL verified with WebFetch and given an `accessed:` date.

Reference example for quality bar: `caching-reuse/prompt-caching-prefix-caching.md`.

> Scorecard scales — Effort: Low/Med/High · Gain: Low/Med/High/Very High · Risk: Low/Med/High.
> L3 techniques skew Effort **Medium–High**. Be honest about the scale threshold where ROI turns
> positive (many L3 techniques lose to a managed API below high volume).
> Add `related:` cross-links (`<category>/<slug>`).

---

## Visibility & Measurement — L3 (1)

### 1. unit-economics-cost-per-outcome — Unit Economics: Cost per Outcome (L3 · visibility)
- **Scope:** measure cost per *resolved business outcome* (a closed support ticket, a completed
  agent task, a shipped PR) rather than cost per token/call — and track AI **unit margin** (revenue
  or value per outcome minus AI cost per outcome). The capstone visibility technique: it turns raw
  spend into a business decision ("is this feature profitable per use?").
- **Key questions (primary sources):**
  1. How to define and instrument an "outcome" and attribute full end-to-end AI cost to it
     (multiple calls, retries, tool use, human-in-loop all roll up to one outcome). Cite FinOps /
     AI-unit-economics writeups + attribution tooling (Langfuse/Helicone traces → outcome IDs).
  2. The AI-unit-margin framing: cost-per-outcome vs price/value-per-outcome; why per-token cost is
     the wrong denominator for a product decision. Find a case study with numbers.
  3. Why L3: requires the L1 tag-based attribution + L2 eval foundation *plus* a business-outcome
     model wired through the whole trace — real cross-system engineering.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium** (decision enabler — reveals
  which features/customers are unprofitable) · Risk **Low**.
- **Detection signals (seed):** cost tracked per token/call but never per resolved outcome; can't
  answer "what does one closed ticket cost us in AI"; no AI unit-margin metric; flat-rate pricing
  on a variable-cost AI feature.
- **Measurement (seed):** cost per outcome by feature/customer; AI unit margin; % of outcomes that
  are margin-negative.
- **2026 freshness:** agentic outcomes (one task = many calls) make per-outcome roll-up essential.
  Cross-link `tag-based-cost-attribution` (L1), `quality-cost-evaluation-suite` (L2),
  `cost-aware-product-tiers` (L3), `agent-budget-guardrails`.
- **Target sources:** CloudZero/Finout AI unit-economics guides, a "cost per resolved ticket" case
  study (e.g. support-AI), Langfuse/Helicone trace-to-outcome attribution docs.

---

## Model Choice & Routing — L3 (3)

### 2. dynamic-model-routing — Dynamic Model Routing (L3 · model-routing)
- **Scope:** route each request at runtime to the cheapest model that can handle *this* input, by
  classifying difficulty/complexity (a router model or heuristic decides per-request). Absorbs
  quality-aware-routing and prompt-adaptive/context-aware (input-size) selection. Distinct from
  L2 provider-routing (same tier, cheapest host) — this routes *across capability tiers by
  difficulty*.
- **Key questions (primary sources):**
  1. Router mechanisms: a small classifier / embedding router / LLM judge that predicts whether a
     cheap model suffices; cite RouteLLM (paper + repo), Martian, NotDiamond, Unify, and
     open routers. Quantify savings at a held quality bar (RouteLLM reports big cost cuts).
  2. The provider-native end: **GPT-5 ships a built-in main/mini/thinking router** — document this
     as the zero-config end of dynamic routing (cite OpenAI). Where managed auto-routers suffice vs
     when you build your own.
  3. Signals a router can use (input length/complexity, task type, required tools, past difficulty).
  4. Failure modes: router misclassification sends a hard query to the cheap model → quality drop;
     router adds latency + its own cost; needs the eval harness to tune the threshold.
- **Scorecard hypothesis:** Effort **High** · Gain **High / Very High** (routes the easy majority
  to cheap models) · Risk **Medium** (misroute degrades quality; router itself is a dependency).
- **Detection signals (seed):** one model for all traffic regardless of difficulty; no per-request
  difficulty signal; cheap-model-capable queries paying flagship prices.
- **Measurement (seed):** blended $/request; % traffic routed to cheap tier; quality held at bar;
  router misroute rate.
- **2026 freshness:** GPT-5 built-in router; RouteLLM-style trained routers. Cross-link
  `model-right-sizing` (L1 static version), `llm-cascades`, `router-training-from-traffic` (L4),
  `provider-routing`, `quality-cost-evaluation-suite`.
- **Target sources:** RouteLLM paper + repo, OpenAI GPT-5 router docs, NotDiamond/Martian/Unify
  docs, an independent routing benchmark.

### 3. llm-cascades — LLM Cascades (L3 · model-routing)
- **Scope:** try a cheap model first, accept its answer only if a confidence/verification check
  passes, otherwise escalate to a more expensive model. Absorbs cheap-to-expensive-escalation.
  Differs from dynamic-routing (which decides *before* generating) — a cascade decides *after*, on
  the actual output.
- **Key questions:**
  1. The cascade mechanism + the accept/escalate gate: self-consistency, verifier model, confidence
     scoring, answer-validation. Cite FrugalGPT (the canonical paper — big cost reductions) and
     follow-ups.
  2. Economics: cheap model resolves X% at ~full savings; only the hard residual pays for the
     expensive model. Quantify the blended cost + the break-even on the verifier's cost.
  3. Where cascades beat single-model and where they lose (when the cheap model's answers can't be
     cheaply verified, or escalation rate is high → you pay for both).
- **Scorecard hypothesis:** Effort **High** · Gain **High** (FrugalGPT-style large cuts when the
  cheap model resolves most traffic) · Risk **Medium** (a weak verifier ships wrong cheap answers).
- **Detection signals (seed):** every request hits the expensive model even though a cheap model
  handles most; no first-pass/escalation structure; no verification gate.
- **Measurement (seed):** % resolved by the cheap tier; blended $/request; escalation rate;
  quality at bar; verifier cost as a share.
- **2026 freshness:** cross-link `dynamic-model-routing`, `model-right-sizing`,
  `quality-cost-evaluation-suite`. Note reasoning models blur cascade vs single-model (a reasoning
  model self-escalates internally).
- **Target sources:** FrugalGPT paper, a cascade/verification follow-up study, a practitioner
  cascade implementation writeup.

### 4. local-open-weight-substitution — Local / Open-Weight Model Substitution (L3 · model-routing)
- **Scope:** replace a hosted frontier API with a self-hosted open-weight model (Llama/Qwen/
  DeepSeek/Mistral) running on your own GPUs for high-volume, well-scoped workloads. **Body MUST
  carry the honest break-even caveat:** below very high, steady volume, managed APIs (incl.
  open-weight-via-API on Together/Fireworks/Groq) almost always win on total cost.
- **Key questions (primary sources):**
  1. The break-even math: GPU-hour cost (rented/owned) + ops burden vs per-token API price × volume;
     where self-hosting turns cheaper (needs high, sustained utilization). Cite serving-cost
     analyses + current GPU pricing + vLLM/SGLang throughput numbers.
  2. What you take on: serving stack (vLLM/SGLang/TGI), autoscaling, utilization risk (idle GPUs
     kill the economics), evals, quality gap vs frontier.
  3. The honest middle path: open-weight *via managed API* first (no ops), self-host only at scale.
- **Scorecard hypothesis:** Effort **High** · Gain **High** at high volume, **negative** below
  break-even · Risk **Medium–High** (utilization risk + quality gap + ops).
- **Detection signals (seed):** very high, steady volume on a narrow task paying frontier API prices;
  data-residency forcing self-host; a workload a small open model handles at quality.
- **Measurement (seed):** $/1M tokens self-hosted (incl. idle) vs API; GPU utilization %; quality
  at bar; break-even volume.
- **2026 freshness:** APIs win below very high volume — state it plainly. Cross-link
  `model-right-sizing`, `provider-routing`, `fine-tuning/local-model-deployment` (L4),
  `calibrated-quantization` (L4).
- **Target sources:** vLLM/SGLang throughput+cost docs, a self-host-vs-API break-even analysis,
  current GPU + open-weight-API pricing.

---

## Prompt & Context Optimization — L3 (5)

### 5. learned-prompt-compression — Learned Prompt Compression (LLMLingua) (L3 · prompt-context)
- **Scope:** use a trained compressor (LLMLingua / LLMLingua-2 / LongLLMLingua) to drop
  low-information tokens from prompts/context before the main model, cutting input tokens while
  preserving task performance. Renamed from prompt-compression.
- **Key questions:**
  1. How LLMLingua works (a small LM scores token informativeness; budget-controlled compression)
     and the realistic compression band — **temper to a realistic 4–10×**, not the cherry-picked
     20× headline. Cite the LLMLingua/LLMLingua-2/LongLLMLingua papers + Microsoft repo.
  2. Where it pays (long, redundant context: RAG chunks, few-shot blocks, docs) vs where it hurts
     (already-terse prompts; tasks needing exact tokens — code, legal).
  3. Costs: the compressor's own inference cost + latency; and that compressed prompts **don't
     prefix-cache** (dynamic per input).
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium–High** (large input-token cuts
  on verbose context) · Risk **Medium** (compression can drop needed detail).
- **Detection signals (seed):** long redundant context sent verbatim; big few-shot/RAG blocks;
  input-token-dominated cost with compressible prose.
- **Measurement (seed):** compression ratio; input tokens/call before/after; quality at bar;
  compressor cost + latency overhead.
- **2026 freshness:** 4–10× realistic band; tension with prefix caching. Cross-link
  `few-shot-example-pruning` (L2), `contextual-compression` (rag L4), `context-window-budgeting`,
  `structured-context-packing`.
- **Target sources:** LLMLingua + LLMLingua-2 + LongLLMLingua papers, Microsoft LLMLingua repo, an
  independent compression eval.

### 6. conversation-summarization — Conversation Summarization (L3 · prompt-context)
- **Scope:** replace growing chat/agent history with a rolling summary once it exceeds a budget, so
  each turn re-sends a compact summary + recent turns instead of the full transcript. **"Compaction"
  is the standard 2026 term** — use it.
- **Key questions:**
  1. The rolling-summary / compaction pattern (summarize-older-turns, keep-recent-verbatim, trigger
     threshold); DIY vs provider-native compaction (Anthropic Compaction API). Cite provider docs +
     framework memory (LangChain/LlamaIndex summary memory).
  2. Cost mechanism: caps per-turn input tokens on long conversations (which otherwise grow O(n²)
     across a session). Quantify on a long agent session.
  3. Quality risk: summarization loses detail; where a dropped fact breaks a later turn; invalidation
     when you summarize too aggressively.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (caps long-session growth) ·
  Risk **Medium** (lost detail).
- **Detection signals (seed):** full transcript re-sent every turn; per-turn cost grows with session
  length; no compaction trigger; long agent runs.
- **Measurement (seed):** tokens/turn over a long session before/after; summary trigger rate;
  quality at bar.
- **2026 freshness:** "compaction" standard term. Cross-link `summary-caching` (L2),
  `provider-native-context-management` (L2), `context-pruning`, `state-compression-for-agents`.
- **Target sources:** Anthropic compaction docs, LangChain/LlamaIndex summary-memory docs, an agent
  long-context writeup.

### 7. context-pruning — Context Pruning (L3 · prompt-context)
- **Scope:** drop irrelevant *retrieved content and tool outputs* from context before the model —
  provenance-aware removal of chunks/tool-results that don't contribute. **Scope: retrieved/
  tool-output pruning** (distinct from prompt-cleanup which edits authored prompt, and from
  learned-compression which shortens text token-by-token).
- **Key questions:**
  1. Pruning mechanisms: relevance scoring of retrieved chunks / tool outputs against the query,
     drop-below-threshold, provenance tracking; the native entry point (Anthropic context editing
     auto-clears stale tool results). Cite provider + RAG-pruning sources.
  2. Cost mechanism: removes whole low-value blocks (bigger, coarser cut than token-level
     compression). Quantify on an agent with fat tool outputs.
  3. Risk: pruning a block that mattered later; needs a relevance signal that's cheap and accurate.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium–High** (fat tool outputs are a
  top agent cost) · Risk **Medium**.
- **Detection signals (seed):** stale tool results / irrelevant chunks accumulating in context; agent
  context dominated by old tool output; nothing ever cleared.
- **Measurement (seed):** context tokens/turn before/after; pruned-block share; quality at bar.
- **2026 freshness:** native context editing (cross-link `provider-native-context-management` L2);
  pair with `reducing-retrieved-chunk-count`, `retrieval-chunk-deduplication`,
  `state-compression-for-agents`.
- **Target sources:** Anthropic context-editing docs, a RAG context-pruning study, an agent tool-
  output management writeup.

### 8. context-offloading — Context Offloading / Filesystem-as-Memory (L3 · prompt-context)
- **Scope:** move state out of the live context window into an external store (files, scratchpad,
  memory tool, DB) and pull only what's needed per step, instead of carrying everything in-context.
  ADD'd in the deep pass.
- **Key questions:**
  1. The pattern: agent writes intermediate results/notes to a filesystem or memory store and reads
     back on demand; cite the native primitives (Anthropic memory tool / filesystem; the
     "filesystem as context" agent pattern) + framework equivalents.
  2. Cost mechanism: keeps the per-turn window small on long/branching tasks (avoids re-sending
     accumulated state every step). Quantify vs carrying it all in-context.
  3. Cost/risk: retrieval steps add calls/latency; a bad read misses needed state.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium–High** (long agent runs) · Risk
  **Medium**.
- **Detection signals (seed):** entire working state carried in every turn; context grows with task
  progress; no external scratchpad/memory.
- **Measurement (seed):** tokens/turn on long tasks before/after; state kept out-of-context.
- **2026 freshness:** native memory tool / filesystem-as-context is the 2026 primitive. Cross-link
  `provider-native-context-management` (L2), `reusable-memory-artifact-store`,
  `state-compression-for-agents`, `conversation-summarization`.
- **Target sources:** Anthropic memory-tool docs, a filesystem-as-context/agent-memory writeup,
  framework memory docs.

### 9. dynamic-few-shot-selection — Dynamic Few-Shot Selection (L3 · prompt-context)
- **Scope:** retrieve only the few-shot examples relevant to *this* input (embedding/kNN over an
  example bank) instead of a fixed large block on every call — fewer example tokens per call at
  equal or better accuracy. ADD'd in the deep pass. Distinct from L2 few-shot-pruning (which cuts
  the static set); this selects per-request.
- **Key questions:**
  1. The mechanism: embed the query, retrieve top-k similar examples from a curated bank, inject only
     those; cite example-selection literature + framework implementations (LangChain example
     selectors, DSPy).
  2. Cost mechanism: sends 2–4 targeted examples instead of 10–20 generic ones → fewer input tokens,
     often higher accuracy. Quantify.
  3. Costs: retrieval + embedding overhead; the example bank curation; and that a per-request example
     set breaks prefix caching.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** · Risk **Low–Medium**.
- **Detection signals (seed):** same large static example block on every call; examples chosen once,
  never per-input; big few-shot token cost with a diverse input distribution.
- **Measurement (seed):** example tokens/call before/after; accuracy at bar; retrieval overhead.
- **2026 freshness:** cross-link `few-shot-example-pruning` (L2), `embedding-caching` (L2),
  `automated-prompt-optimization` (L4), `learned-prompt-compression`.
- **Target sources:** an example-selection paper (kNN few-shot), LangChain example-selector docs,
  DSPy docs.

---

## Caching & Reuse — L3 (5)

### 10. semantic-caching — Semantic Caching (L3 · caching-reuse)
- **Scope:** cache responses keyed by *embedding similarity* so semantically-equivalent (not
  byte-identical) queries hit the cache. The fuzzy sibling of exact-response-caching. **Fold in the
  gateway/deploy-buy path** (a gateway = the buy option; it also covers exact caching).
- **Key questions:**
  1. Mechanism: embed query → vector search → if cosine ≥ threshold, return the cached answer.
     Cite GPTCache (repo/paper), Portkey/Cloudflare/LiteLLM semantic cache, Redis semantic caching.
  2. The threshold tradeoff: too loose → wrong-answer false hits (the core risk); too tight → low
     hit rate. How to tune + invalidate. Quantify hit rate + $ saved from a real deployment.
  3. Where it works (FAQ/support/repeated intents) vs where false hits are dangerous
     (personalized/precise/high-stakes answers).
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium–High** (100% savings on a hit,
  higher hit rate than exact) · Risk **Medium–High** (false hits serve a wrong-but-similar answer).
- **Detection signals (seed):** many near-duplicate queries missing an exact cache; high repeated-
  intent traffic; exact cache at low hit rate on paraphrased inputs.
- **Measurement (seed):** semantic hit rate + $ saved; false-hit rate (sampled); threshold; latency.
- **2026 freshness:** gateway = buy path. Cross-link `exact-response-caching` (L2),
  `cache-invalidation-strategies`, `cache-hit-rate-instrumentation` (L2), `embedding-caching` (L2),
  `retrieval-result-caching`.
- **Target sources:** GPTCache paper+repo, Portkey/Cloudflare/Redis semantic-cache docs, a semantic-
  cache case study with hit-rate numbers.

### 11. retrieval-result-caching — Retrieval Result Caching (L3 · caching-reuse)
- **Scope:** cache the *retrieved set* (chunks/results) for a query so a repeated/similar query skips
  re-running retrieval (embedding + vector search + rerank). MOVED L2→L3 for **freshness/
  invalidation** difficulty.
- **Key questions:**
  1. What to cache (query → retrieved chunk IDs / reranked set) and the key (exact vs semantic query
     match). Cite RAG caching writeups + framework/vector-DB caching.
  2. **The L3 driver — freshness/invalidation:** when the underlying corpus changes, cached
     retrieval sets go stale; TTL vs event-based invalidation on index updates. This is the hard part.
  3. Cost mechanism: skips embedding + ANN search + rerank per hit (bigger when reranking is
     expensive). Quantify.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (saves retrieval compute, not the
  LLM call) · Risk **Medium** (stale retrieval on a changed corpus).
- **Detection signals (seed):** same/similar queries re-running full retrieval; static-ish corpus with
  repeated queries; expensive reranker re-run per identical query.
- **Measurement (seed):** retrieval cache hit rate; retrieval $/latency saved; staleness incidents.
- **2026 freshness:** invalidation-first framing. Cross-link `reranking-before-generation` (L2),
  `semantic-caching`, `embedding-caching` (L2), `cache-invalidation-strategies`.
- **Target sources:** a RAG-caching writeup, vector-DB/framework caching docs, a cache-invalidation
  reference.

### 12. tool-result-caching — Tool Result Caching (L3 · caching-reuse)
- **Scope:** cache the results of agent tool calls (API lookups, DB queries, web fetches, computations)
  so repeated identical calls within/across agent runs don't re-execute — saving the tool cost *and*
  the tokens of re-processing the result. MOVED L2→L3 for **freshness/invalidation**.
- **Key questions:**
  1. What's cacheable (idempotent/deterministic tool calls: lookups, static fetches, pure computations)
     vs what's not (writes, time-sensitive queries). Key design (tool + args hash).
  2. **The L3 driver — freshness:** external data changes; TTL per tool type, invalidation on writes,
     the risk of serving stale tool output to the agent. Cite agent-caching writeups + provider tool-
     use docs.
  3. Cost mechanism: repeated tool calls are common in agent loops; caching cuts both the external
     cost and the re-embed of results. Quantify on an agent that re-queries.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (saves tool cost + retokenization) ·
  Risk **Medium** (stale external data).
- **Detection signals (seed):** agents re-calling the same tool with identical args; repeated
  web-fetch/DB lookups in a run; no tool-result memoization.
- **Measurement (seed):** tool-call cache hit rate; tool cost + tokens saved; stale-result incidents.
- **2026 freshness:** cross-link `cache-aware-agent-design`, `reusable-memory-artifact-store`,
  `retrieval-result-caching`, `cache-invalidation-strategies`, `tool-use-minimization` (L2).
- **Target sources:** an agent tool-result caching writeup, provider tool-use docs, a caching-TTL
  reference.

### 13. cache-aware-agent-design — Cache-Aware Agent Design (L3 · caching-reuse)
- **Scope:** design agent prompts/loops so the prefix stays stable and cache-hittable across steps —
  static-first/volatile-last ordering, append-don't-mutate history, stable tool definitions — to
  maximize prompt-cache hit rate over a multi-step run. Design-time prefix optimization.
- **Key questions:**
  1. The design rules: stable system/tools prefix, append tool results (don't rewrite history),
     avoid mid-run tool-set changes / timestamps in the prefix. Cite Anthropic prompt-caching +
     context-engineering docs (the ProjectDiscovery 7%→84% hit-rate, ~59% cost cut is the exemplar).
  2. Why agents specifically: long multi-step runs re-send a growing prefix every step; a cache-
     friendly design turns O(n) full-price re-processing into cache reads. Quantify.
  3. What breaks it (any prefix mutation invalidates everything after — enumerate the silent
     invalidators).
- **Scorecard hypothesis:** Effort **Medium** · Gain **High** (agent loops re-send the prefix every
  step; caching it is a large cut) · Risk **Low**.
- **Detection signals (seed):** low `cache_read` share on agent traffic; prefix mutated each step
  (timestamps, reordered tools, rewritten history); no static-first ordering.
- **Measurement (seed):** prefix-cache hit rate across a run; cached-token share; $/run before/after.
- **2026 freshness:** ProjectDiscovery exemplar. Cross-link `prompt-caching-prefix-caching` (L1),
  `cache-hit-rate-instrumentation` (L2), `structured-context-packing` (L2), `tool-use-minimization`,
  `state-compression-for-agents`.
- **Target sources:** Anthropic prompt-caching + effective-context-engineering docs, ProjectDiscovery
  case study, an agent caching writeup.

### 14. cache-invalidation-strategies — Cache Invalidation Strategies (L3 · caching-reuse)
- **Scope:** the cross-cutting discipline for keeping every cache (exact/semantic/retrieval/tool/
  embedding) correct as data changes — TTLs, versioned keys, event-based invalidation, staleness
  bounds. The technique that makes aggressive caching *safe*. Standalone.
- **Key questions:**
  1. The invalidation toolkit: TTL, write-through/write-invalidate, versioned/namespaced keys
     (model version, prompt version, corpus version), event-driven purge. Cite caching-systems
     references (Redis, CDN invalidation patterns) + LLM-cache docs.
  2. The correctness framing: a cache without invalidation is a wrong-answer generator; how to bound
     staleness per cache type and pick TTL by data volatility.
  3. Cost/quality tradeoff: tighter invalidation = lower hit rate = less savings; how to tune.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (enabler — lets you cache more
  aggressively without shipping stale answers) · Risk **Low** (done right; the *absence* is the risk).
- **Detection signals (seed):** caches with no TTL/versioning; stale answers after a model/prompt/
  corpus change; keys not namespaced by version.
- **Measurement (seed):** stale-hit rate; time-to-invalidate after a change; hit rate vs staleness
  bound.
- **2026 freshness:** cross-link every cache: `exact-response-caching` (L2), `semantic-caching`,
  `retrieval-result-caching`, `tool-result-caching`, `embedding-caching` (L2), `summary-caching` (L2).
- **Target sources:** Redis/CDN invalidation references, a cache-consistency writeup, LLM-gateway
  cache-config docs (TTL/versioning).

---

## Batching & Async — L3 (2)

### 15. latency-tiered-processing — Latency-Tiered Processing (L3 · batching-async)
- **Scope:** classify each request by how fast it truly needs to be, and route non-urgent work to a
  cheaper/slower tier (batch, flex/service-tier, off-peak, queued) while only latency-critical work
  pays for the fast tier. The routing layer above batch-api-usage.
- **Key questions:**
  1. The tier menu (2026): sync/standard, **flex** (OpenAI `service_tier:"flex"`, ~50% off),
     **batch** (~50% off, 24h), **priority** (a PREMIUM — the spend-up end). Cite OpenAI service-tier
     + batch docs, Anthropic batch. How to map request classes → tiers.
  2. The engineering: a scheduler/queue that assigns tier by SLA, with fallbacks (flex 429 → retry/
     upgrade). Quantify blended savings from moving the non-urgent majority down a tier.
  3. Where it fails (truly interactive workloads; when everything is "urgent" by default).
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **High** (most work tolerates latency;
  moving it to 50%-off tiers is large) · Risk **Low–Medium** (mis-tiering a latency-critical request).
- **Detection signals (seed):** everything on the sync/standard tier; no SLA classification; async-
  tolerant work paying interactive prices; priority tier used indiscriminately.
- **Measurement (seed):** % traffic by tier; blended $/request; SLA-miss rate; savings from downshift.
- **2026 freshness:** 4 tiers incl. Priority = premium; batch+caching stack ~75%. Cross-link
  `batch-api-usage` (L1), `bulk-extraction-classification` (L2), `pre-generation`,
  `latency-tiered-processing`↔`user-controlled-quality-mode`.
- **Target sources:** OpenAI service-tier (flex/priority) + batch docs+pricing, Anthropic batch docs,
  a latency-tiering architecture writeup.

### 16. pre-generation — Pre-Generation (Infra) (L3 · batching-async)
- **Scope:** the infrastructure to generate content *ahead of demand* on a schedule/trigger and serve
  it instantly — the backend engine behind product-level precompute (queues, workers, batch jobs,
  storage, refresh). MOVED L2→L3 (infra precompute). Distinct from product-ux precomputed-content-
  surfacing (the UX/decision) — this is the pipeline.
- **Key questions:**
  1. The infra: scheduled/event-triggered batch generation jobs, a queue/worker system, output store,
     freshness/refresh policy, backfill. Cite batch-API + a precompute-pipeline architecture writeup.
  2. Cost mechanism: shifts live per-request generation to amortized offline batch (+ batch discount),
     and decouples generation from request-time load. Quantify.
  3. Where it fails (low-reuse/long-tail content; high-churn data that stales fast).
- **Scorecard hypothesis:** Effort **High** (real pipeline) · Gain **Medium–High** (on predictable/
  high-reuse content) · Risk **Medium** (staleness; precomputing unused content).
- **Detection signals (seed):** predictable content generated live per request; no batch/precompute
  pipeline; request-time latency + cost spikes on generatable-ahead content.
- **Measurement (seed):** % served from pre-generated store; $/item (batch vs live); staleness; unused-
  precompute waste.
- **2026 freshness:** cross-link `precomputed-content-surfacing` (product-ux L2), `batch-api-usage`
  (L1), `latency-tiered-processing`, `exact-response-caching` (L2).
- **Target sources:** Batch API docs, a precompute-pipeline/architecture writeup, a job-queue/worker
  reference.

---

## RAG-Specific Optimization — L3 (3)

### 17. hierarchical-retrieval — Hierarchical Retrieval (L3 · rag)
- **Scope:** retrieve in stages over a hierarchy (summaries/parents → drill into children; or
  coarse→fine) so you read *fewer units* to find the answer instead of scanning many flat chunks.
  **Body must note the cost is "fewer retrieved units," not smaller context per se.**
- **Key questions:**
  1. The patterns: parent-document / summary-index / recursive retrieval / auto-merging; cite
     LlamaIndex (recursive/auto-merging retrievers) + RAPTOR (hierarchical tree) paper.
  2. Cost mechanism: route to the right subtree and pull only the relevant leaves → fewer chunks (and
     fewer LLM-context tokens) at equal recall. Quantify the retrieved-unit reduction. Be precise
     that the win is unit count, not inherently a smaller window.
  3. Costs: building/maintaining the hierarchy (summary generation, re-index on change); extra
     retrieval hops.
- **Scorecard hypothesis:** Effort **High** · Gain **Medium–High** (fewer, better-targeted units on
  large corpora) · Risk **Medium** (wrong subtree misses the answer; index maintenance).
- **Detection signals (seed):** flat top-k over a large corpus; big k "to be safe"; many chunks
  retrieved to cover a structured document set.
- **Measurement (seed):** retrieved units + context tokens/query; recall at bar; index build/refresh
  cost.
- **2026 freshness:** unit-count framing. Cross-link `reducing-retrieved-chunk-count` (L1),
  `reranking-before-generation` (L2), `precomputed-document-summaries`, `chunking-parameter-tuning`.
- **Target sources:** RAPTOR paper, LlamaIndex recursive/auto-merging retriever docs, a hierarchical-
  RAG benchmark.

### 18. precomputed-document-summaries — Precomputed Document Summaries (L3 · rag)
- **Scope:** precompute a summary per document (offline) and retrieve/route on summaries first —
  serve or route from the cheap summary layer instead of pulling full documents into context. MOVED
  L2→L3; absorbs summary-index-routing.
- **Key questions:**
  1. The pattern: summarize each doc once (batch), index summaries, retrieve/route on them; pull full
     content only when needed. Cite LlamaIndex document-summary index + a summary-routing writeup.
  2. Cost mechanism: routing/answering from short summaries cuts retrieved tokens vs full-doc
     retrieval; the summarization cost is amortized (once per doc, reused across queries). Quantify +
     break-even (queries per doc).
  3. Costs/risks: summary generation + refresh on doc change; a summary that omits the queried detail.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium–High** (on high-query-reuse
  corpora) · Risk **Medium** (summary omits needed detail; staleness).
- **Detection signals (seed):** full documents pulled into context for routing/overview queries; no
  summary layer; same docs retrieved repeatedly at full length.
- **Measurement (seed):** retrieved tokens/query before/after; queries-per-doc (break-even);
  summarization + refresh cost.
- **2026 freshness:** absorbs summary-index-routing. Cross-link `summary-caching` (L2),
  `hierarchical-retrieval`, `precomputed-content-surfacing` (product-ux L2),
  `reducing-retrieved-chunk-count` (L1).
- **Target sources:** LlamaIndex document-summary-index docs, a summary-routing RAG writeup, a
  summarization-quality reference.

### 19. embedding-quantization-mrl — Embedding Quantization & MRL Truncation (L3 · rag)
- **Scope:** shrink embedding vectors — binary/int8 quantization and Matryoshka (MRL) dimension
  truncation — to cut vector-DB storage + ANN search cost at scale. **Frame honestly: this is
  vector-DB/infra cost, NOT token/LLM cost.** ADD'd.
- **Key questions:**
  1. The techniques: int8/binary quantization (32×/4× smaller, rescoring to recover accuracy) and
     **MRL truncation** (use the first N dims of a Matryoshka-trained embedding). Cite the MRL paper,
     Hugging Face/Cohere/Qdrant quantization guides, and OpenAI `dimensions` param docs.
  2. Cost mechanism: storage + memory + query-compute on the vector DB drop sharply at scale; quantify
     (e.g. binary = 32× storage cut, ~large recall retention with rescoring). Be explicit it's infra,
     not tokens.
  3. Accuracy tradeoff: recall loss per compression level; rescoring/oversampling to recover it.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium** (large *infra* savings at scale;
  negligible at small scale) · Risk **Medium** (recall loss if over-compressed).
- **Detection signals (seed):** full-precision float32 vectors at large corpus scale; high vector-DB
  storage/RAM bill; embeddings never dimension-reduced.
- **Measurement (seed):** vector-DB storage/RAM + query cost before/after; recall at bar per
  compression level.
- **2026 freshness:** infra-not-token framing. Cross-link `embedding-caching` (L2),
  `specialized-embedding-models` (fine-tuning L3), `reducing-retrieved-chunk-count` (L1).
- **Target sources:** MRL (Matryoshka) paper, Hugging Face embedding-quantization blog, Qdrant/Cohere
  quantization docs, OpenAI `dimensions` docs.

---

## Output Optimization — L3 (1)

### 20. constrained-decoding — Constrained Decoding / Grammars (L3 · output)
- **Scope:** constrain generation to a formal grammar/schema at decode time (self-hosted: GBNF/
  Outlines/XGrammar/llama.cpp grammars; or provider structured-outputs) so output is always valid.
  **Reframe for 2026: this is ~free at decode and is primarily a RELIABILITY technique, not a token-
  savings one** — the cost win is eliminated retry/repair loops, not fewer tokens.
- **Key questions:**
  1. How grammar-constrained decoding works (mask invalid tokens each step) and that modern
     implementations add ~0 decode overhead. Cite Outlines, XGrammar (paper/repo), llama.cpp GBNF,
     provider structured-output docs.
  2. The real cost mechanism: guarantees valid structured output → **kills the retry/validate/repair
     tax** (invalid JSON reruns, parser failures). Quantify the retry-elimination saving; don't
     overclaim per-call token savings.
  3. Where it's L3 (self-hosted grammar serving) vs where the managed structured-outputs feature (L1)
     already covers it — draw the line.
- **Scorecard hypothesis:** Effort **Medium–High** (self-hosted grammar stack) · Gain **Medium**
  (retry elimination + reliability) · Risk **Low** (over-tight grammars can truncate valid outputs).
- **Detection signals (seed):** invalid-output retry loops; JSON parse failures; regex/repair passes on
  model output; self-hosted models emitting malformed structure.
- **Measurement (seed):** invalid-output rate → ~0; retries eliminated; $ saved on reruns.
- **2026 freshness:** reliability-not-token-savings reframe; ~free at decode. Cross-link
  `structured-outputs` (L1), `template-plus-fill` (L2), `post-processing-instead-of-generation` (L2),
  `local-model-deployment` (L4).
- **Target sources:** Outlines + XGrammar papers/repos, llama.cpp GBNF docs, provider structured-
  output docs.

---

## Fine-Tuning, Distillation & Specialized Models — L3 (4)

> **Category-wide 2026 freshness (apply to every FT page):** OpenAI self-serve fine-tuning is
> **winding down (May 2026 announcement)** → the center of gravity is **open-weight + LoRA/QLoRA**
> and **managed-open on Bedrock/Vertex**. Every fine-tuning page needs a **vendor-availability
> caveat**. Fine-tuning is ONE umbrella technique; distillation, synthetic data, and LoRA/QLoRA are
> *methods inside it*, not peers.

### 21. fine-tuning-cheaper-models — Fine-Tuning Cheaper Models (L3 · fine-tuning)
- **Scope:** the umbrella — fine-tune a small/cheap (often open-weight) model to match a big model on
  *your* narrow task, then run the cheap model in production. **Absorbs distillation, synthetic-data
  generation, and LoRA/QLoRA as methods.**
- **Key questions:**
  1. The methods (as sections): **distillation** (teacher-generated labels train a student),
     **synthetic data** generation, **LoRA/QLoRA** (parameter-efficient, cheap to train + serve).
     Cite the LoRA/QLoRA papers + a distillation writeup + provider/OSS FT guides.
  2. Economics: training cost (one-time) amortized over inference savings (small model = 10–100×
     cheaper/token); break-even volume. Quantify with a real case (a fine-tuned small model matching
     a frontier model on a narrow task at a fraction of cost).
  3. The distillation flywheel (cross-link `router-training-from-traffic` L4) and where fine-tuning
     fails (broad/changing tasks; too little data; frontier still needed).
- **Scorecard hypothesis:** Effort **High** · Gain **High / Very High** at volume · Risk **Medium**
  (quality/coverage gap; maintenance as the task drifts).
- **Detection signals (seed):** a narrow, high-volume, stable task on a frontier model; lots of
  labeled/loggable examples; repetitive extraction/classification/format work.
- **Measurement (seed):** $/request fine-tuned small vs frontier; quality at bar; training cost +
  break-even volume.
- **2026 freshness:** OpenAI FT winding down → open-weight + LoRA/QLoRA, Bedrock/Vertex managed-open;
  vendor caveat mandatory. Cross-link `model-right-sizing` (L1), `task-specific-classifiers`,
  `task-specific-extractors`, `local-model-deployment` (L4), `multi-lora-serving` (L4),
  `router-training-from-traffic` (L4).
- **Target sources:** LoRA + QLoRA papers, a distillation (student/teacher) writeup, provider/OSS
  fine-tuning guides, a fine-tuned-small-model cost case study.

### 22. task-specific-classifiers — Task-Specific Classifiers (L3 · fine-tuning)
- **Scope:** replace an LLM doing classification (intent, routing, moderation, tagging, sentiment)
  with a small trained classifier (fine-tuned encoder like BERT/DeBERTa, or a logistic head on
  embeddings) — orders of magnitude cheaper/faster per call.
- **Key questions:**
  1. When a classifier beats an LLM: fixed label set, high volume, latency-sensitive — a fine-tuned
     encoder or embedding+head runs at ~zero marginal cost vs an LLM call. Cite encoder-FT guides +
     a cost/latency comparison.
  2. Economics: training/labeling cost vs per-call LLM cost × volume; the huge per-call gap. Quantify.
  3. Where the LLM still wins (open-ended/zero-shot/rapidly-changing label sets; too few labels).
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **High / Very High** on high-volume fixed-
  label classification · Risk **Medium** (label drift; needs retraining).
- **Detection signals (seed):** an LLM classifying into a fixed label set at volume; routing/moderation
  via LLM calls; high classification spend with stable categories.
- **Measurement (seed):** $/1k classifications LLM vs classifier; accuracy at bar; retrain cadence.
- **2026 freshness:** vendor caveat. Cross-link `bulk-extraction-classification` (L2),
  `model-right-sizing` (L1), `fine-tuning-cheaper-models`, `dynamic-model-routing`,
  `specialized-embedding-models`.
- **Target sources:** an encoder fine-tuning guide (BERT/DeBERTa/SetFit), embeddings+classifier-head
  docs, an LLM-vs-classifier cost/latency comparison.

### 23. task-specific-extractors — Task-Specific Extractors (L3 · fine-tuning)
- **Scope:** replace an LLM doing structured extraction (fields from documents/text — invoices,
  forms, entities) with a small trained extraction model (fine-tuned encoder / token-classification /
  layout model), at a fraction of per-call cost. Kept separate from classifiers.
- **Key questions:**
  1. Extraction-specific methods: token classification / span extraction / layout-aware models
     (LayoutLM-family) / fine-tuned small seq2seq; cite the relevant model docs + an extraction cost
     comparison.
  2. Economics: same as classifiers — training cost vs LLM-per-doc × volume; quantify on a high-volume
     document pipeline. Pairs with `bulk-extraction-classification` (the L2 LLM version) as the next
     tier down in cost.
  3. Where the LLM still wins (varied/unseen schemas, low volume, messy long-tail formats).
- **Scorecard hypothesis:** Effort **High** · Gain **High** on high-volume fixed-schema extraction ·
  Risk **Medium** (schema/format drift; labeling cost).
- **Detection signals (seed):** an LLM extracting the same fields from high document volume; fixed
  schema, stable formats; large extraction spend.
- **Measurement (seed):** $/1k docs LLM vs extractor; field-level accuracy at bar; labeling + retrain
  cost.
- **2026 freshness:** vendor caveat. Cross-link `bulk-extraction-classification` (L2),
  `task-specific-classifiers`, `fine-tuning-cheaper-models`, `structured-outputs` (L1).
- **Target sources:** a token-classification / LayoutLM extraction guide, a fine-tuned-extractor cost
  case study, structured-extraction docs.

### 24. specialized-embedding-models — Specialized Embedding Models (L3 · fine-tuning)
- **Scope:** use a domain/task-tuned embedding model to hit a quality bar at lower cost — **RESCOPE
  to LEAD with Matryoshka (MRL) truncation** (the direct cost lever: fewer dims → cheaper storage +
  search) plus domain fine-tuning of the embedder. Kept distinct from the removed
  smaller-embedding-models.
- **Key questions:**
  1. **Lead with MRL truncation** — a Matryoshka-trained embedder lets you use the first N dims for a
     big storage/search cost cut at controlled recall loss; then domain fine-tuning / contrastive
     tuning to match quality with a smaller/cheaper embedder. Cite MRL paper + an embedding-FT guide.
  2. Cost mechanism: smaller/cheaper embedder + truncatable dims → lower embedding-call cost AND lower
     vector-DB cost (overlaps `embedding-quantization-mrl` — cross-link, don't duplicate: that page
     is quantization/infra, this is the model choice + MRL).
  3. When it pays (large corpus, domain mismatch with a general embedder) vs when a general API
     embedder is fine.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium** (embedding + vector-DB cost cut
  at scale) · Risk **Medium** (retrieval quality if the specialized model underperforms).
- **Detection signals (seed):** a general large embedder on a specialized/high-volume corpus; full-
  dim embeddings never truncated; embedding + vector-DB cost significant.
- **Measurement (seed):** embedding + vector-DB $/M vs baseline; retrieval recall at bar; dims used.
- **2026 freshness:** lead with MRL; vendor caveat. Cross-link `embedding-quantization-mrl` (rag L3),
  `embedding-caching` (L2), `reducing-retrieved-chunk-count` (L1).
- **Target sources:** MRL paper, an embedding fine-tuning / contrastive-tuning guide, MTEB or a
  domain-embedding benchmark, provider embedding docs.

---

## Agent & Workflow Optimization — L3 (3)

### 25. state-compression-for-agents — State Compression for Agents (L3 · agent-workflow)
- **Scope:** compress the agent's running state/trace (past steps, tool outputs, reasoning) into a
  compact working memory so long runs don't re-send an ever-growing transcript. **Absorbs
  agent-trace-summarization.** Has native-primitive entry points (context editing / memory tool) —
  cross-link provider-native-context-management.
- **Key questions:**
  1. Methods: rolling trace summarization, structured state objects, dropping resolved sub-tasks,
     native context editing/compaction. Cite agent-memory + Anthropic context-management docs.
  2. Cost mechanism: agent context grows every step; compression caps per-step input tokens on long
     runs (the dominant agent cost). Quantify on a long run.
  3. Risk: compressing away state a later step needs; the compression call's own cost.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **High** (long agent runs) · Risk **Medium**.
- **Detection signals (seed):** full trace re-sent each step; per-step tokens grow with run length;
  no state compaction; long autonomous runs.
- **Measurement (seed):** tokens/step over a long run before/after; state size; quality/task success.
- **2026 freshness:** native entry points. Cross-link `provider-native-context-management` (L2),
  `conversation-summarization`, `context-offloading`, `reusable-memory-artifact-store`,
  `cache-aware-agent-design`.
- **Target sources:** Anthropic context-management (editing/compaction/memory) docs, an agent-memory/
  state-compression writeup, a long-horizon-agent case study.

### 26. reusable-memory-artifact-store — Reusable Memory / Artifact Store (L3 · agent-workflow)
- **Scope:** persist reusable artifacts and learned knowledge across agent runs (a memory store /
  artifact cache / knowledge file) so agents don't re-derive the same intermediate results or
  re-learn the same facts every session — cross-run reuse.
- **Key questions:**
  1. The pattern: a durable store of artifacts (computed results, generated code/docs, learned facts)
     keyed for reuse; native memory tool + memory stores. Cite Anthropic memory-tool / memory-store
     docs + an agent-memory writeup.
  2. Cost mechanism: reuse across runs avoids re-generating/re-deriving (and re-paying for) the same
     work; distinct from within-run caching. Quantify on a repeated-task agent.
  3. Costs/risks: staleness of stored artifacts, retrieval overhead, storage management.
- **Scorecard hypothesis:** Effort **Medium–High** · Gain **Medium** (on repeated/overlapping tasks) ·
  Risk **Medium** (stale artifacts served as fresh).
- **Detection signals (seed):** agents re-deriving the same results across sessions; no cross-run
  artifact reuse; repeated identical sub-tasks paid for every run.
- **Measurement (seed):** artifact reuse rate; work/$ avoided across runs; staleness incidents.
- **2026 freshness:** native memory stores. Cross-link `context-offloading`,
  `state-compression-for-agents`, `tool-result-caching`, `provider-native-context-management` (L2).
- **Target sources:** Anthropic memory-tool + memory-store docs, an agent-memory/artifact-reuse
  writeup, a framework long-term-memory reference.

### 27. workflow-decomposition — Workflow Decomposition (L3 · agent-workflow)
- **Scope:** decompose an open-ended agent task into a fixed, code-orchestrated workflow of smaller
  scoped steps (each with the cheapest sufficient model/prompt) instead of one big autonomous loop —
  fewer tokens, cheaper per-step models, no wandering. MOVED L2→L3.
- **Key questions:**
  1. Workflow-vs-agent framing: predefined orchestration (chains, routers, fixed DAGs) vs open agent
     loops; cite Anthropic "Building Effective Agents" (workflows vs agents) + a decomposition writeup.
  2. Cost mechanism: each step uses a right-sized model + minimal context (vs one loop carrying the
     whole task on a frontier model); bounded steps stop runaway loops. Quantify vs a monolithic agent.
  3. Where a real agent is still needed (genuinely open-ended, unpredictable tasks) — don't over-
     decompose.
- **Scorecard hypothesis:** Effort **High** · Gain **High** (right-sized cheap steps + bounded token
  use) · Risk **Low–Medium** (rigid workflow can't handle novelty).
- **Detection signals (seed):** one big autonomous agent for a task that's actually a fixed pipeline;
  frontier model on every step; unbounded loops; high token use on structured work.
- **Measurement (seed):** $/task workflow vs monolithic agent; tokens/task; steps bounded; success at
  bar.
- **2026 freshness:** cross-link `agent-budget-guardrails` (L1), `specialized-sub-agents` (L4),
  `programmatic-tool-calling` (L4), `model-right-sizing` (L1), `human-in-the-loop-checkpoints` (L2).
- **Target sources:** Anthropic "Building Effective Agents" (workflows vs agents), a task-
  decomposition writeup, an agent-vs-workflow cost comparison.

---

## Product & UX-Level Optimization — L3 (1)

### 28. cost-aware-product-tiers — Cost-Aware Product Tiers (L3 · product-ux)
- **Scope:** structure product tiers/limits so AI spend is bounded per tier — usage caps, abuse-
  limited free tiers, model-access gating by plan. **RESCOPE body to spend-bounding ONLY** (usage
  caps, quotas, which models each tier can invoke); **exclude pricing/margin/monetization** (that's a
  business decision, out of scope). Absorbs usage-based-pricing-alignment *only in the cap sense*.
- **Key questions:**
  1. The spend-bounding levers: per-tier usage quotas/rate limits, free-tier abuse limits (the
     dominant uncontrolled-cost source), gating expensive models/features behind higher tiers. Cite
     product/AI-cost-control writeups + gateway per-key budget docs.
  2. Cost mechanism: caps tail/abuse cost (a free tier without limits is a cost bomb) and aligns AI
     cost exposure to tier. Quantify a free-tier-abuse scenario avoided.
  3. Boundary: this is *spend control*, not monetization — explicitly exclude pricing strategy.
- **Scorecard hypothesis:** Effort **Medium** · Gain **Medium–High** (kills free-tier/abuse tail cost)
  · Risk **Low** (a bad cap harms UX).
- **Detection signals (seed):** unlimited free tier on an AI feature; no per-tier usage caps; all tiers
  can invoke the most expensive models; free-tier abuse driving spend.
- **Measurement (seed):** AI cost per tier; free-tier cost per user; abuse-capped spend; % spend by
  tier.
- **2026 freshness:** spend-bounding-only rescope. Cross-link `budget-limits-guardrails` (L1),
  `ai-feature-gating` (L1), `user-controlled-quality-mode` (L2), `unit-economics-cost-per-outcome`,
  `agent-budget-guardrails`.
- **Target sources:** a per-tier AI-cost-control writeup, gateway per-key/per-tier budget docs, a
  free-tier-abuse case study.

---

## Execution notes (for the fan-out)

- One subagent per technique. Each reads: its brief above, `docs/TEMPLATE.md`, the reference page
  `src/content/techniques/caching-reuse/prompt-caching-prefix-caching.md`, and `src/content.config.ts`.
- Deep-research with primary sources; **WebFetch-verify every URL** and set `accessed: "2026-07-03"`.
- Write directly to `src/content/techniques/<category>/<slug>.md` (overwrite the stub):
  `status: published`, `maturityProvisional: false`, `lastUpdated: "2026-07-03"`, filled scorecard +
  detectionSignals + measurementMethods + `related` + structured `sources`.
- Footnote/source sync is mandatory: every inline `[^id]` ↔ a `sources` entry with the same id.
- **L3 honesty:** name the scale/volume threshold where each technique's ROI turns positive; many lose
  to a managed API or a simpler L1/L2 technique below high volume.
- Do NOT touch `taxonomy.mjs` or any other technique's file.
