# Wave 4 research briefs — Near-Frontier / Adaptive (L4)

**Scope:** the final **9 Level-4 techniques** — "continuously self-optimizing." L4 is the frontier
of cost/quality: router-training flywheels, optimizer-tuned prompts, self-hosted fine-tuned models,
calibrated quantization/QAT, multi-adapter serving, graph retrieval, code-execution tool calling,
and sub-agent architectures. These demand the most engineering AND the highest, most sustained
volume to pay off — several are net-negative below very large scale. Honesty about the scale gate
is the whole point of an L4 page.

**How to use a brief:** resolve the **Key questions** against primary sources, confirm/adjust the
**Scorecard hypothesis**, fold in the **2026 freshness** notes, then fill the page per
`docs/TEMPLATE.md` (4 body sections + frontmatter scorecard + detection signals + measurement +
structured `sources`).

**Definition of done** (per `docs/RESEARCH_PLAN.md`): all 4 body sections written with concrete
detail; **≥5 quality sources** with primaries for every number; scorecard + detection signals +
measurement filled and defensible; `status: published`, `maturityProvisional: false`,
`lastUpdated: "2026-07-03"`; `npm run build` passes; every inline `[^id]` has a matching `sources`
entry and vice-versa; every source URL verified with WebFetch and given an `accessed:` date.

Reference example for quality bar: `caching-reuse/prompt-caching-prefix-caching.md`.

> Scorecard scales — Effort: Low/Med/High · Gain: Low/Med/High/Very High · Risk: Low/Med/High.
> L4 techniques are almost all Effort **High**. Name the volume/scale threshold where ROI turns
> positive, and the simpler L1–L3 technique that wins below it.
> Add `related:` cross-links (`<category>/<slug>`).

---

## Model Choice & Routing — L4 (1)

### 1. router-training-from-traffic — Router Training From Production Traffic (L4 · model-routing)
- **Scope:** the adaptive/flywheel version of routing — train (and continuously retrain) a router
  on your *own* production traffic + outcome/quality labels so it learns which requests each model
  tier can handle, improving as data accrues. The self-optimizing end of `dynamic-model-routing`.
  Absorbs fine-tuned-routing-classifiers.
- **Key questions (primary sources):**
  1. The flywheel: log requests + which model succeeded (from evals/user signals/cascade
     escalations) → train a router classifier → deploy → collect more labels → retrain. Cite
     RouteLLM (trains on preference data), a production-router writeup, and the general "data
     flywheel" framing (e.g. NVIDIA/industry).
  2. Why L4 not L3 dynamic-routing: a *static* router is L3; L4 is the **continuous retraining
     loop** on proprietary traffic — an MLOps system, not a config. Quantify the marginal gain over
     an off-the-shelf router.
  3. Costs/risks: label pipeline, retraining cadence, distribution drift, the router becoming a
     maintained ML product.
- **Scorecard hypothesis:** Effort **High** · Gain **High** (a router tuned to *your* traffic beats
  a generic one; compounds over time) · Risk **Medium** (drift; label quality; ML maintenance).
- **Detection signals (seed):** using a generic/off-the-shelf router with no feedback loop; rich
  production traffic + outcome labels going unused; routing quality plateaued.
- **Measurement (seed):** router accuracy vs oracle over time; blended $/request trend; % traffic on
  cheapest-sufficient tier as the model improves; retraining cadence.
- **2026 freshness:** GPT-5's built-in router is the zero-effort baseline this must beat; the
  distillation flywheel (cross-link `fine-tuning-cheaper-models`) is the sibling pattern. Cross-link
  `dynamic-model-routing` (L3), `llm-cascades` (L3 — a label source), `quality-cost-evaluation-suite`
  (L2), `unit-economics-cost-per-outcome` (L3).
- **Target sources:** RouteLLM paper (preference-data training), a data-flywheel/router-training
  writeup, an MLOps continuous-training reference, an independent routing benchmark.

---

## Prompt & Context Optimization — L4 (1)

### 2. automated-prompt-optimization — Automated Prompt Optimization (DSPy / GEPA) (L4 · prompt-context)
- **Scope:** use an optimizer (DSPy MIPROv2 / GEPA / OPRO-style) to *search* for prompts + few-shot
  sets that maximize a metric — including a **cost/length term** so the optimizer minimizes tokens
  while holding quality. Prompts become compiled artifacts, not hand-written.
- **Key questions (primary sources):**
  1. How the optimizers work (DSPy compiles a program against a metric with bootstrapped
     demonstrations; GEPA does reflective/evolutionary prompt search). Cite the DSPy paper/docs +
     GEPA paper. How a token/cost penalty is added to the metric.
  2. The cost angle specifically: optimizers can find *shorter* prompts that match or beat
     hand-tuned ones (fewer input tokens per call, compounding at volume), and can select the
     cheapest model that still passes the metric. Quantify with a reported result.
  3. Why L4: needs a metric/eval harness, a training set, and compute for the optimization search —
     a real optimization loop, not prompt editing. Costs: optimizer compute; re-optimization when
     models/tasks change.
- **Scorecard hypothesis:** Effort **High** · Gain **Medium–High** (optimized prompts cut tokens +
  enable smaller models; strongest on pipelines run at volume) · Risk **Medium** (overfit to the
  eval set; opaque prompts; brittle across model swaps).
- **Detection signals (seed):** prompts hand-tuned by trial-and-error; no metric-driven prompt search;
  a stable high-volume task where a shorter optimized prompt would compound; a good eval set sitting
  unused for optimization.
- **Measurement (seed):** metric score at fixed cost, or cost at fixed metric, optimized vs hand-tuned;
  input tokens/call after optimization; optimizer compute cost + re-opt cadence.
- **2026 freshness:** GEPA is the 2026 reflective-optimizer entrant; DSPy is the incumbent. Cross-link
  `quality-cost-evaluation-suite` (L2 — the metric), `few-shot-example-pruning` (L2),
  `dynamic-few-shot-selection` (L3), `learned-prompt-compression` (L3).
- **Target sources:** DSPy paper + docs (MIPROv2), GEPA paper, an independent DSPy/GEPA cost-or-quality
  benchmark, a practitioner optimization case study.

---

## RAG-Specific Optimization — L4 (2)

### 3. contextual-compression — Contextual Compression (L4 · rag)
- **Scope:** compress retrieved context *conditioned on the query* before generation — extractive
  (keep only query-relevant sentences/spans) or abstractive (a small model rewrites chunks to the
  query) — cutting generation-context tokens beyond what reranking/dedup achieve. **Add the
  cheap-long-context caveat:** when long-context input is cheap (and prompt-cached), the compression
  overhead may not pay.
- **Key questions:**
  1. Methods: LangChain ContextualCompressionRetriever (LLM/embeddings extractors), RECOMP / Provence
     (extractive+abstractive compressors), LLMLingua-for-RAG. Cite the papers + framework docs.
  2. Cost mechanism: sends only the query-relevant slice to the (expensive) generator → fewer
     generation tokens at held answer quality; quantify the reduction and the compressor's own cost.
  3. **The caveat that makes it L4/borderline:** the compressor is an extra model call + latency, and
     if input tokens are cheap or the context prefix-caches, plain long-context (or L2 reranking) can
     be cheaper overall. Be honest about when it does NOT pay.
- **Scorecard hypothesis:** Effort **High** · Gain **Medium** (query-conditioned cut, but the
  compressor eats into it) · Risk **Medium–High** (compression drops a needed detail; extra failure
  point).
- **Detection signals (seed):** large retrieved context sent whole to the generator; reranking/dedup
  already applied but context still fat; generation-token-dominated RAG cost.
- **Measurement (seed):** generation-context tokens/query before/after; answer quality at bar;
  compressor cost + latency vs generator savings.
- **2026 freshness:** cheap-long-context caveat. Cross-link `reranking-before-generation` (L2),
  `retrieval-chunk-deduplication` (L2), `learned-prompt-compression` (prompt-context L3),
  `hierarchical-retrieval` (L3).
- **Target sources:** RECOMP + Provence papers, LangChain ContextualCompressionRetriever docs, a
  RAG-compression benchmark, LLMLingua-for-RAG.

### 4. graphrag-vs-vector-tradeoff — GraphRAG vs Vector Tradeoff (L4 · rag)
- **Scope:** a *decision* page — when a knowledge-graph RAG (entity/relation graph + community
  summaries, e.g. Microsoft GraphRAG) is worth its heavy indexing cost vs plain vector RAG, framed as
  a cost/quality tradeoff. NOT a "build GraphRAG" cheerleader — the honest call is that GraphRAG's
  indexing is expensive and only pays for specific query types.
- **Key questions:**
  1. The tradeoff: GraphRAG's LLM-heavy indexing (entity extraction + community summarization over
     the whole corpus) is a large upfront/refresh cost; it pays for **global/multi-hop/"connect the
     dots" queries** where vector RAG fails. Cite Microsoft GraphRAG (paper + repo) + a cost analysis.
  2. Quantify both sides: GraphRAG indexing token cost (it can be very high per corpus), vs the
     query-time win on global-sensemaking questions; and cheaper middle grounds (LazyGraphRAG,
     lightweight graph approaches) that cut indexing cost.
  3. The decision rule: most products should default to vector RAG (+ rerank); reach for GraphRAG only
     when queries are genuinely global/relational AND the corpus is stable enough to amortize
     indexing. Be explicit this is L4 because it's a heavy, specialized build with a narrow payoff.
- **Scorecard hypothesis:** Effort **High** · Gain **Medium** (only on the right query mix; negative
  otherwise) · Risk **Medium–High** (huge indexing cost for a payoff that may not materialize).
- **Detection signals (seed):** global/multi-hop questions vector RAG can't answer; considering
  GraphRAG without costing the indexing; a stable corpus with relational query needs.
- **Measurement (seed):** GraphRAG indexing $ per corpus (+ refresh); answer quality on global vs
  local queries GraphRAG vs vector; break-even query volume.
- **2026 freshness:** LazyGraphRAG / lighter variants cut the indexing cost. Cross-link
  `hierarchical-retrieval` (L3), `precomputed-document-summaries` (L3),
  `reducing-retrieved-chunk-count` (L1), `reranking-before-generation` (L2).
- **Target sources:** Microsoft GraphRAG paper + repo, a GraphRAG-indexing-cost analysis, a
  GraphRAG-vs-vector benchmark, the LazyGraphRAG writeup.

---

## Fine-Tuning, Distillation & Specialized Models — L4 (3)

> **Category-wide 2026 freshness (apply to each):** OpenAI self-serve fine-tuning is winding down
> (May 2026 → Jan 2027) → center of gravity is **open-weight + LoRA/QLoRA** and **managed-open on
> Bedrock/Vertex**. Every page needs a vendor-availability caveat. These L4 pages are the
> *self-hosted, owned-model* frontier — distinct from the L3 `fine-tuning-cheaper-models` (train a
> cheaper model, often via a managed API) — so lead with the "you own and operate the serving stack"
> framing and the scale gate.

### 5. local-model-deployment — Local Model Deployment (L4 · fine-tuning)
- **Scope:** self-host a fine-tuned *narrow* model at scale on your own GPUs — the operationalized
  end of owning a specialized model (serving stack, autoscaling, utilization, reliability). Distinct
  from L3 `local-open-weight-substitution` (substitute a general open model) — this is running a
  model you *fine-tuned* for one task at production scale.
- **Key questions:**
  1. The full serving picture: vLLM/SGLang/TGI, continuous batching, autoscaling, quantized serving,
     utilization targets; the ops/reliability burden. Cite serving-framework docs + a production
     self-hosting cost analysis.
  2. Economics at scale: a fine-tuned small model self-hosted at high utilization can beat any API on
     $/token for that narrow task — but only at very high, steady volume with the utilization to
     justify owned/rented GPUs. Quantify the break-even (reuse the L3 substitution math but for a
     fine-tuned model) and the utilization sensitivity.
  3. Where it fails: sub-break-even volume, spiky traffic (idle GPUs), broad tasks, teams without
     ML-serving ops.
- **Scorecard hypothesis:** Effort **High** · Gain **High / Very High** at scale (owned narrow model
  at high utilization) · Risk **High** (utilization + ops + reliability; net-negative below scale).
- **Detection signals (seed):** very high sustained volume on a fine-tuned narrow model still paying
  API prices; data-residency/latency forcing on-prem; utilization high enough to saturate GPUs.
- **Measurement (seed):** $/1M tokens self-hosted (incl. idle) vs API; GPU utilization %; p99 latency;
  break-even volume; ops cost.
- **2026 freshness:** vendor caveat; multi-LoRA (below) makes serving many narrow models cheaper.
  Cross-link `local-open-weight-substitution` (L3), `fine-tuning-cheaper-models` (L3),
  `calibrated-quantization`, `multi-lora-serving`.
- **Target sources:** vLLM/SGLang/TGI docs, a production self-hosting cost/utilization analysis, an
  autoscaling-inference reference, current GPU pricing.

### 6. calibrated-quantization — Calibrated Quantization (GPTQ / AWQ / QAT) (L4 · fine-tuning)
- **Scope:** compress a model's weights (and/or activations) with calibration data so it serves
  cheaper/faster at minimal quality loss — **model-production** quantization (GPTQ/AWQ/SmoothQuant
  post-training + QAT), distinct from the removed infra serving-side `quantization`. **Body note:**
  post-training AWQ/GPTQ is roughly **L3-effort**; **QAT is the L4 piece** (retraining with quant in
  the loop for the hardest accuracy-retention cases).
- **Key questions:**
  1. The methods: GPTQ, AWQ, SmoothQuant (post-training, calibration-set-based) and QAT
     (quantization-aware training). Cite the GPTQ + AWQ (+ SmoothQuant) papers and QAT references.
  2. Cost mechanism: INT8/INT4/FP8 weights → less GPU memory + higher throughput + fewer/cheaper GPUs
     for the same model → lower $/token when self-hosting. Quantify the memory/throughput gain and the
     typical accuracy retention per bit-width (with rescoring/calibration).
  3. The accuracy tradeoff + when QAT is worth the L4 effort vs when post-training AWQ suffices;
     hardware support (FP8 on newer GPUs).
- **Scorecard hypothesis:** Effort **Medium–High** (AWQ/GPTQ Medium; QAT High) · Gain **Medium–High**
  (fewer/cheaper GPUs at scale) · Risk **Medium** (accuracy loss if under-calibrated; only relevant
  when self-hosting).
- **Detection signals (seed):** self-hosting full-precision (FP16) weights; GPU-memory-bound serving;
  paying for more/bigger GPUs than a quantized model needs.
- **Measurement (seed):** GPU memory + throughput + $/token before/after per bit-width; quality
  retention at bar; calibration effort.
- **2026 freshness:** only matters for the self-hosted path (pairs with local-model-deployment).
  Cross-link `local-model-deployment`, `local-open-weight-substitution` (L3), `multi-lora-serving`,
  `embedding-quantization-mrl` (rag L3 — the embedding analogue).
- **Target sources:** GPTQ + AWQ papers, a SmoothQuant/QAT reference, vLLM/TensorRT-LLM quantization
  docs, a quantized-serving cost/throughput benchmark.

### 7. multi-lora-serving — Multi-LoRA Serving (L4 · fine-tuning)
- **Scope:** serve **many** LoRA adapters (100–200+) on a **single** base model / GPU, swapping
  adapters per request — so owning dozens of narrow fine-tuned models costs ~one base model's serving
  footprint instead of N. Makes the "many specialized models" strategy economically viable. ADD'd.
- **Key questions (primary sources):**
  1. The mechanism: a shared base + per-request adapter selection (S-LoRA, Punica, vLLM multi-LoRA,
     LoRAX); how throughput holds with many adapters. Cite S-LoRA (paper — "serve thousands of
     LoRA adapters") + vLLM/LoRAX multi-LoRA docs.
  2. Cost mechanism: N adapters share one base's GPU memory + serving → per-model serving cost
     collapses; quantify (adapters/GPU, throughput vs a single model, cost vs N separate deployments).
  3. Where it fits (a product with many narrow tasks/tenants each wanting a tuned model) vs where it
     doesn't (one or two models — no adapter-sharing benefit; adapters that need different base
     models).
- **Scorecard hypothesis:** Effort **High** · Gain **High** at multi-model scale (collapses N serving
  stacks to ~1) · Risk **Medium** (serving complexity; per-adapter quality; base-model coupling).
- **Detection signals (seed):** many separate fine-tuned model deployments each on its own GPU; a
  per-tenant/per-task fine-tuning strategy with N growing; GPU cost scaling linearly with model count.
- **Measurement (seed):** adapters served per GPU; $/model-served vs separate deployments; throughput
  with N adapters; base-GPU utilization.
- **2026 freshness:** makes `fine-tuning-cheaper-models` at N-model scale affordable. Cross-link
  `fine-tuning-cheaper-models` (L3), `local-model-deployment`, `calibrated-quantization`,
  `task-specific-classifiers`/`extractors` (L3 — candidates for adapters).
- **Target sources:** S-LoRA paper, Punica paper, vLLM multi-LoRA docs, LoRAX/Predibase docs.

---

## Agent & Workflow Optimization — L4 (2)

### 8. programmatic-tool-calling — Programmatic Tool Calling (Code Execution with MCP) (L4 · agent-workflow)
- **Scope:** the agent writes **code** that calls tools as APIs inside a code-execution sandbox;
  intermediate tool results stay in the sandbox and only the final result returns to the model's
  context — instead of every tool call + full result round-tripping through the context window.
  **Highest-impact gap in the catalog** (per DECISIONS). GA Anthropic Feb 2026; ~98.7% token cut in
  the headline case.
- **Key questions (primary sources):**
  1. The mechanism: code execution + tool APIs (Anthropic "code execution with MCP" / programmatic
     tool calling; add `code_execution` + `allowed_callers` on the tool). Cite the Anthropic
     engineering post + docs. Quantify the token reduction (the ~98.7% / 150k→2k figure) and why it
     works (loops/filters/large intermediates never enter context).
  2. When it wins: many sequential tool calls, large intermediate results that get filtered, data
     transformations — where standard tool-calling round-trips dominate token cost. Quantify vs
     standard tool use.
  3. Costs/limits: needs a code-execution sandbox; incompatible with some features (strict/forced
     tool_choice, MCP-tool constraints per the docs); the model must write correct code.
- **Scorecard hypothesis:** Effort **High** · Gain **High / Very High** (drops intermediate-result
  tokens — often the dominant agent cost) · Risk **Medium** (sandbox dependency; generated-code
  correctness).
- **Detection signals (seed):** agents making many sequential tool calls with large results
  round-tripping through context; tool-result tokens dominating an agent's bill; data-heavy tool
  chains.
- **Measurement (seed):** tokens/task standard-tool-use vs PTC; intermediate-result tokens kept out of
  context; task success at bar.
- **2026 freshness:** GA Feb 2026; the biggest agent-cost lever. Cross-link `tool-use-minimization`
  (L2), `workflow-decomposition` (L3), `state-compression-for-agents` (L3), `specialized-sub-agents`.
- **Target sources:** Anthropic "code execution with MCP" engineering post + programmatic-tool-calling
  docs, an MCP token-tax analysis, a PTC benchmark/case study.

### 9. specialized-sub-agents — Specialized Sub-Agents (L4 · agent-workflow)
- **Scope:** decompose a task across purpose-built sub-agents (each its own context, tools, often a
  right-sized model) coordinated by an orchestrator. **LEAD with the 15× token-multiplier trade-off**
  (per DECISIONS): multi-agent systems can use ~15× the tokens of a single chat — so this is a **net
  cost win only when tasks genuinely parallelize** (or when a cheap sub-agent model offsets the
  multiplier); otherwise it *raises* cost.
- **Key questions (primary sources):**
  1. The pattern + the honest cost math: Anthropic's multi-agent research system reports agents use
     ~4× the tokens of chat and multi-agent ~15×. Cite Anthropic's multi-agent-research post. So the
     page must frame this as a cost technique **conditionally** — it saves money only via (a) parallel
     wall-clock on decomposable work, (b) right-sizing each sub-agent to a cheaper model, or (c)
     keeping the orchestrator's context small by delegating detail. Quantify.
  2. Where it's a cost win vs a cost sink: parallelizable/independent subtasks + cheap sub-agent
     models = win; sequential/coupled tasks = the 15× multiplier dominates and a single agent or a
     workflow is cheaper.
  3. Cross-link `workflow-decomposition` (L3 — the cheaper, deterministic alternative when the task is
     actually a fixed pipeline) and note when to prefer it.
- **Scorecard hypothesis:** Effort **High** · Gain **Medium** (conditional — real on parallel work +
  right-sized sub-agents; negative otherwise) · Risk **Medium–High** (the 15× multiplier; coordination
  overhead; can easily cost *more*).
- **Detection signals (seed):** a broad task with genuinely independent parallel subtasks on one big
  agent; sub-agents all on a frontier model; orchestrator context bloated with sub-task detail.
- **Measurement (seed):** $/task multi-agent vs single-agent vs workflow; token-multiplier vs
  wall-clock/quality gain; sub-agent model mix.
- **2026 freshness:** lead with the 15× caveat. Cross-link `workflow-decomposition` (L3),
  `model-right-sizing` (L1), `programmatic-tool-calling`, `state-compression-for-agents` (L3),
  `agent-budget-guardrails` (L1).
- **Target sources:** Anthropic "building a multi-agent research system" post (the 4×/15× figures), a
  multi-agent cost analysis, an agent-framework (LangGraph/CrewAI) multi-agent doc, a parallel-vs-
  sequential agent benchmark.

---

## Execution notes (for the fan-out)

- One subagent per technique. Each reads: its brief above, `docs/TEMPLATE.md`, the reference page
  `src/content/techniques/caching-reuse/prompt-caching-prefix-caching.md`, and `src/content.config.ts`.
- Deep-research with primary sources; **WebFetch-verify every URL** and set `accessed: "2026-07-03"`.
- Write directly to `src/content/techniques/<category>/<slug>.md` (overwrite the stub):
  `status: published`, `maturityProvisional: false`, `lastUpdated: "2026-07-03"`, filled scorecard +
  detectionSignals + measurementMethods + `related` + structured `sources`.
- Footnote/source sync is mandatory: every inline `[^id]` ↔ a `sources` entry with the same id.
- **L4 honesty is the whole point:** name the scale/volume threshold where ROI turns positive and the
  simpler technique that wins below it. Several L4 techniques (contextual-compression, graphrag,
  specialized-sub-agents) are conditional or net-negative in the common case — say so plainly.
- Do NOT touch `taxonomy.mjs` or any other technique's file.
