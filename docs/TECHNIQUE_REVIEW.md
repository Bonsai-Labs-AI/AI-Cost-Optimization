# Technique catalog review (pre-decision sheet)

Synthesis of four parallel research passes (mid-2026) over the 124-technique catalog,
validated against the L0–L4 maturity definitions. This is the input to the per-technique
decision flow — nothing here is applied yet. Every change becomes a choice you make.

**Legend:** MOVE = re-tier · MERGE = fold into another · RENAME · ADD = new technique ·
REMOVE. Current provisional level in (Lx).

---

## 0. Cross-cutting themes (the big picture)

1. **The pyramid is top-heavy and the top is stale.** The biggest single finding: the
   **entire fine-tuning category is mis-tiered L4**. Managed FT APIs + LoRA/QLoRA + vendor
   distillation moved fine-tuning, distillation, rerankers, and routing-classifiers down to
   **L2–L3**. Reserve **L4** for what's genuinely frontier in 2026: self-hosting at scale,
   distillation/synthetic-data *flywheels*, cost-aware planning, speculative decoding.
2. **Off-the-shelf tooling demoted many "L3" items to L2.** Semantic caching, LLM cascades,
   dynamic routing (managed), hybrid search, hierarchical retrieval, contextual compression,
   cost-regression/anomaly — all now standard-tooling work, not custom systems.
3. **The catalog over-counts trivial guardrails and near-duplicates.** Agent loop/tool/retry
   limits are one L1 thing. So are several attribution, batching, and output entries.
   ~18 merge candidates identified.
4. **Reasoning/thinking-token spend is the headline 2026 gap.** Reasoning models cost ~3–9×
   on hidden thinking tokens; explicit budgets (`reasoning_effort`, `thinking_budget_tokens`,
   Gemini thinking budget) are missing entirely and are arguably the highest-ROI new lever.
5. **RAG is missing the 2025–26 retrieval-cost frontier:** embedding quantization/MRL,
   semantic/late chunking, contextual retrieval, adaptive retrieval, drop-reranker-when-unneeded.
6. **Serving is missing the 2026 scale wins:** disaggregated prefill/decode, prefix-cache-aware
   routing, KV-cache offload/tiering, multi-LoRA serving, chunked prefill.

---

## 1. Proposed additions (deduped, ~22)

| # | Proposed technique | Category | Sugg. level | Why it matters (one line) | Source |
|---|---|---|---|---|---|
| A1 | **Reasoning / thinking-token budgeting** | model-routing (or prompt-context) | L1–L2 | Cap hidden reasoning spend (`reasoning_effort`, `thinking_budget_tokens`); reasoning models cost 3–9× output price | [OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |
| A2 | **Unit economics: cost-per-successful-task** | visibility | L2 | Optimize cost per resolved outcome, not per token — the metric routing/distillation should target | [CloudZero](https://www.cloudzero.com/blog/llm-api-pricing-comparison/) |
| A3 | **Per-layer cache-hit-rate instrumentation** | visibility | L1–L2 | Teams that don't measure hit rate per cache layer never capture the savings | [ref](https://akshayghalme.com/blogs/how-llm-caching-actually-works/) |
| A4 | **Per-agent-run / per-trace cost attribution** | visibility | L2 | Roll cost up per agent run (tool-call fan-out), not per request | [Braintrust](https://www.braintrust.dev/articles/how-to-track-llm-costs-2026) |
| A5 | **Open-weight via managed API** (Together/Fireworks/Groq/DeepSeek) | model-routing | L1–L2 | Most open-weight savings ($0.15–0.60/M) without self-hosting's L3 burden | [CloudZero](https://www.cloudzero.com/blog/llm-api-pricing-comparison/) |
| A6 | **Router training from production traffic** (preference flywheel) | model-routing | L4 | The true-L4 routing move: train your own router from logged outcomes (RouteLLM: 95% quality @ 14% strong calls) | [RouteLLM](https://github.com/lm-sys/routellm) |
| A7 | **Context offloading / filesystem-as-memory** | prompt-context (or agents) | L3 | Write big tool outputs to files, reload on demand; ~47% agent token reduction | [Anthropic context editing](https://www.anthropic.com/engineering/contextual-retrieval) |
| A8 | **Dynamic/retrieval-selected few-shot (coreset)** | prompt-context | L3 | Pick minimal high-value exemplars per query vs a fixed bank | [arXiv](https://arxiv.org/pdf/2511.08977) |
| A9 | **Verbosity controls (provider param)** | output | L1 | GPT-5 `verbosity` scales answer length independent of reasoning, one param | [OpenAI cookbook](https://cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools) |
| A10 | **Constrained decoding / grammars** (XGrammar, Outlines) | output | L2–L3 | Enforce CFG/regex output; kills retries/repair, near-zero overhead in 2026 | [JSONSchemaBench](https://arxiv.org/html/2501.10868v1) |
| A11 | **Draft-then-refine / two-pass generation** | output (or agents) | L2 | Cheap small-model draft, selective strong-model refine | [arXiv](https://arxiv.org/pdf/2603.03305) |
| A12 | **Embedding quantization + MRL truncation** | rag | L2 | int8 (4×)/binary (32×) + Matryoshka dims → up to ~80% storage/search cost, ~1.5% recall loss | [HF](https://huggingface.co/blog/embedding-quantization) |
| A13 | **Semantic chunking** | rag | L2 | Split on embedding-similarity drift; better recall on dense docs | [ref](https://medium.com/@garima_yadav/chunking-hybrid-search-and-reranking-what-actually-improves-rag-de3d453c9059) |
| A14 | **Late chunking** | rag | L2–L3 | Embed full doc then chunk token-embeddings; preserves global context | [arXiv](https://arxiv.org/pdf/2409.04701) |
| A15 | **Contextual retrieval** (contextual embeddings + BM25) | rag | L2 | Anthropic method; cuts failed retrievals 49% (67% w/ rerank), uses prompt caching | [Anthropic](https://www.anthropic.com/engineering/contextual-retrieval) |
| A16 | **Adaptive retrieval / retrieve-only-when-needed** | rag | L3 | Skip retrieval per-query (Self-RAG/Probing-RAG); skips up to 57.5% of cases | [arXiv](https://arxiv.org/pdf/2504.01018) |
| A17 | **Drop-reranker-when-unnecessary** | rag | L2 | Reranking is 62–84% of pipeline latency for ~4pp recall; route it only on weak queries | [arXiv](https://arxiv.org/pdf/2507.04942) |
| A18 | **GraphRAG vs vector tradeoff (LazyGraphRAG)** | rag | L3 | Multi-hop via KG; full GraphRAG indexing pricey, LazyGraphRAG ~0.1% of it | [ref](https://www.falkordb.com/blog/vectorrag-vs-graphrag-technical-challenges-enterprise-ai-march25/) |
| A19 | **LoRA / QLoRA fine-tuning (+ PEFT)** | fine-tuning | L2–L3 | The dominant FT method; QLoRA-tune a 7B in hours on a ~$1.5k GPU — the enabler behind the FT re-tiering | [introl](https://introl.com/blog/fine-tuning-infrastructure-lora-qlora-peft-scale-guide-2025) |
| A20 | **Multi-LoRA serving** | infra-serving | L2–L3 | Dozens of adapters/GPU, 2–3× throughput-per-dollar; off-the-shelf in vLLM | [AWS](https://aws.amazon.com/blogs/machine-learning/efficiently-serve-dozens-of-fine-tuned-models-with-vllm-on-amazon-sagemaker-ai-and-amazon-bedrock/) |
| A21 | **Disaggregated prefill/decode serving** | infra-serving | L3–L4 | 2026 standard; ~75% more throughput; LMSYS R1 at $0.20/M out | [Spheron](https://www.spheron.network/blog/prefill-decode-disaggregation-gpu-cloud/) |
| A22 | **Prefix-cache-aware routing** | infra-serving | L3 | Up to 57× faster TTFT / 2× throughput vs round-robin; split from load-balancing | [vLLM](https://docs.vllm.ai/projects/production-stack/en/latest/use_cases/prefix-aware-routing.html) |
| A23 | **KV-cache offload/tiering (LMCache)** | infra-serving | L3 | GPU→CPU→NVMe KV reuse; TTFT 11s→1.5s on 128k prompt | [arXiv](https://arxiv.org/pdf/2510.09665) |
| A24 | **Chunked prefill** | infra-serving | L2 | Off-the-shelf flag; ~20% throughput on long-prefill/short-decode | [premai](https://blog.premai.io/) |
| A25 | **Spot / preemptible GPU** | infra-serving | L2 | 50–80% savings for fault-tolerant/batch (caveat: 2025 price convergence) | [introl](https://introl.com/blog/spot-instances-preemptible-gpus-ai-cost-savings) |
| A26 | **Confidence-surfacing / graceful-abstain UX** | product-ux | L2 | Show "not sure" instead of forcing expensive escalation/retry | — |
| A27 | **Generative / structural caching** | caching-reuse | L3 | Reuse responses across *structurally* similar prompts (beyond exact/semantic) | [arXiv](https://arxiv.org/html/2511.17565v1) |

> Some additions overlap existing entries (e.g. A23 KV-offload vs a self-hosted KV-reuse note;
> A1 thinking-budget vs an output length family). The decision flow will resolve these.

---

## 2. Tier-change proposals

| Technique | Current | → Proposed | Reason |
|---|---|---|---|
| per-customer-cost-attribution | L2 | **L1** | Same metadata primitive as per-feature (or merge) |
| cost-regression-tests | L3 | **L2** | CI eval extension, off-the-shelf (Braintrust/Promptfoo) |
| cost-anomaly-detection | L3 | **L2** | Rolling-baseline alerts built into Helicone/Datadog/Langfuse |
| dynamic-model-routing | L3 | **L2** (managed) / keep L3 custom | RouteLLM/NotDiamond/OpenRouter are off-the-shelf |
| llm-cascades | L3 | **L2** | FrugalGPT-style verifier+threshold, no custom infra |
| confidence-based-routing | L4 | **L3** | logprobs/calibration signal, implementable today — not frontier |
| fallback-routing | L2 | **L1** (consider) | One-line failover config; reliability-motivated |
| static-dynamic-prompt-separation | L2 | **L1** | The precondition for L1 prefix caching; low-effort, no evals |
| semantic-caching | L3 | **L2** | GPTCache/Redis mature; work is threshold tuning |
| embedding-caching | L2 | **L1** | Hash-keyed cache, trivial |
| intermediate-artifact-caching | L3 | **L2** | Ordinary memoization, off-the-shelf stores |
| cache-invalidation-strategies | L3 | **L2 / cross-cutting** | A property of every cache, not a standalone tier slot |
| metadata-filtering | L2 | **L1** | Config-level in every vector DB; also a correctness/security win |
| contextual-compression | L3 | **L2** | LLMLingua is OSS + LlamaIndex integration (caveat: cheap long-ctx models weaken case) |
| hierarchical-retrieval | L3 | **L2** | Built-in parent-doc retriever in LlamaIndex/LangChain |
| hybrid-search-tuning | L3 | **L2** | Dense+BM25+RRF built into Weaviate/Qdrant/Elastic |
| document-level-routing | L3 | **L2** | Lightweight classifier/metadata rule (or merge into query-classification) |
| workload-scheduling | L3 | **L2** | Off-peak job scheduling = ops config |
| offline-queueing | L2 | **L1** (or merge into batch-api-usage) | Natural mechanics of batch API |
| smaller-embedding-models | L2 | **L1** | Config-level model swap (3-small 20× cheaper than 3-large) |
| fine-tuning-shorter-prompts | L4 | **L3** | Managed FT API; PromptIntern >90% input cut |
| fine-tuning-cheaper-models | L4 | **L3** | Managed API, ROI in weeks |
| distillation | L4 | **L3** (L4 only for custom flywheel) | Vendor distillation APIs: 75% cheaper, <2% loss |
| fine-tuned-rerankers | L4 | **L3** | Cross-encoders off-the-shelf; FT one is L3 |
| fine-tuned-routing-classifiers | L4 | **L3** | RouteLLM is OSS |
| continuous-batching | L3 | **L1 / baseline** | On by default in vLLM/SGLang/TGI — table stakes |

---

## 3. Merge & remove proposals

| Action | Items | Into / note |
|---|---|---|
| MERGE | per-feature + per-customer (+ per-agent-run) attribution | one **tag-based cost attribution** (feature/customer/agent dimensions) |
| MERGE | **llm-cascades ≡ cheap-to-expensive-escalation** | keep `llm-cascades` (clearest duplicate in the set) |
| MERGE/sharpen | task-based-model-selection ↔ model-right-sizing | merge, or sharpen (task-*type* vs difficulty-tier) |
| MERGE/sharpen | quality-aware-routing → dynamic-model-routing | or sharpen to "predicted-quality signal" vs confidence |
| MERGE | json-function-call-outputs → structured-outputs | it's a delivery mechanism of structured outputs |
| MERGE | short-answer-first-ux → progressive-disclosure | same idea framed as UX |
| MERGE | deterministic-formatting → post-processing-instead-of-generation | both "move format work out of token stream" |
| MERGE | chunk-overlap-optimization → chunk-size-optimization | → "chunking-parameter-tuning" (one eval-driven knob) |
| MERGE/sharpen | multi-stage-retrieval → reranking-before-generation | or sharpen to cascade-retrieval (cheap recall → precision) |
| MERGE | summary-caching → intermediate-artifact-caching | summary cache is one example |
| MERGE | async-report-generation → background-enrichment / pre-generation | thin specialization |
| MERGE | default-cheap-optional-deep → progressive-ai-depth | consolidate the "cheap default/deep opt-in" trio to 2 |
| MERGE (consider) | expensive-feature-confirmation → ai-feature-gating | confirmation is a gating mechanism |
| MERGE (consider) | system-prompt-minimization → prompt-cleanup | overlapping intent |
| MERGE | **agent-loop-limits + tool-call-limits + retry-limits** | one L1 **agent budget guardrails / circuit breaker** |
| MERGE | task-specific-extractors → task-specific-classifiers | → "task-specific small models / encoders" |
| MERGE | agent-trace-summarization → state-compression-for-agents | trace summarization is a subset |
| MERGE | agent-step-deduplication → agentic-cache-strategy | result memoization |
| MERGE | cold-start-reduction + model-warm-pools | one "cold-start reduction / warm pools" |
| REMOVE/re-scope | request-batching (infra) | subsumed by continuous-batching; re-scope to app-level offline batch or drop |

---

## 4. Rename proposals

| Current | → Rename | Why |
|---|---|---|
| prompt-compression | **learned-prompt-compression (LLMLingua-family)** | Separate the distinctly-L3 learned method from L2 summarization/truncation |
| precomputed-pregeneration (product) | **precomputed-content-surfacing** | Differentiate the product-side decision from the batching-side `pre-generation` mechanism |
| prompt-version-cost-tracking | **prompt-version-cost-quality-tracking** | Value is cost *and* quality regression per version |
| answerability-detection | keep, but **add adaptive-retrieval** as distinct | "can context answer / abstain" ≠ "should we retrieve at all" |
| agentic-cache-strategy | keep, **re-scope to runtime loop/result caching** | vs `cache-aware-agent-design` = design-time prefix structuring |

---

## 5. Content-freshness flags (apply during research)

- **Structured outputs / constrained decoding overhead** — the old "5–15% latency" claim is
  outdated; XGrammar (default in vLLM/SGLang/TRT-LLM) runs at near-zero/negative overhead.
- **serving-framework-choice** — drop/de-emphasize **TGI** (Hugging Face moved it to
  maintenance mode; now recommends vLLM/SGLang/llama.cpp/MLX).
- **paged attention / continuous batching** — now always-on baselines, not optional levers.
- **contextual-compression** — cheap long-context models (Gemini 3 Flash-Lite $0.25/$1.50,
  DeepSeek V3.2 $0.28/$0.42 per M) weaken the compression ROI case; add the caveat.
- **local-model-deployment** — break-even ~100–256M tok/mo; hidden eng cost dominates (~1.5–2 FTE).

---

## 6. Net effect if all proposals accepted (rough)

- Start: **124** techniques.
- Merges/removals: **−~22** → ~102.
- Additions: **+~27** → **~129**.
- Tier rebalance: L4 shrinks to a true frontier set (~6–8); L2 grows; the pyramid stops being
  top-heavy and better matches "what clients actually adopt, in order."

These are **proposals only.** Next: we walk every technique one-by-one and you decide.
