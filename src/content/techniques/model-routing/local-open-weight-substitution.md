---
title: "Local / Open-Weight Model Substitution"
category: model-routing
maturityLevel: 3
maturityProvisional: false
shortDescription: "Replace a hosted frontier API with a self-hosted open-weight model on your own GPUs for high-volume, well-scoped workloads — cheaper per token only above a high, steady-utilization break-even, and a net loss below it."
effort: High
gain: High
riskToQuality: Medium
detectionSignals:
  - "Very high, steady volume on a narrow, well-scoped task paying frontier API prices."
  - "A workload a small open model already handles at the quality bar (extraction, classification, routing, summarization)."
  - "Data-residency, air-gap, or compliance rules that forbid sending data to a hosted API."
  - "Predictable, sustained traffic that could keep a GPU fleet busy (not spiky, not long-tail)."
measurementMethods:
  - "$/1M tokens self-hosted (including idle GPU time and ops overhead) vs. the open-weight-via-API and frontier-API price."
  - "GPU utilization % (average and p50) — the number that makes or breaks the economics."
  - "Break-even volume: monthly tokens (or API $) at which self-host cost crosses under the API cost."
  - "Quality held at the eval bar vs. the frontier baseline (task-specific eval suite)."
status: published
lastUpdated: "2026-07-03"
related:
  - "model-routing/model-right-sizing"
  - "model-routing/provider-and-fallback-routing"
  - "model-routing/dynamic-model-routing"
  - "fine-tuning/fine-tuning-cheaper-models"
sources:
  - id: vllm-docs
    title: "vLLM — Easy, fast, and cheap LLM serving"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/stable/"
    accessed: "2026-07-03"
    kind: docs
    note: "State-of-the-art serving throughput via PagedAttention, continuous batching, chunked prefill, and prefix caching."
  - id: anyscale-batching
    title: "How continuous batching enables 23x throughput in LLM inference while reducing p50 latency"
    publisher: "Anyscale"
    authors: "Cade Daniel et al."
    year: 2023
    url: "https://www.anyscale.com/blog/continuous-batching-llm-inference"
    accessed: "2026-07-03"
    kind: blog
    note: "Continuous batching alone ~8x over static batching; vLLM (continuous batching + PagedAttention) ~23x. Throughput depends entirely on keeping the batch full."
  - id: sglang-docs
    title: "SGLang — Fast Serving Framework for LLMs and VLMs"
    publisher: "SGLang Documentation"
    year: 2026
    url: "https://docs.sglang.io/"
    accessed: "2026-07-03"
    kind: docs
    note: "RadixAttention, prefix caching, multi-GPU parallelism; cited as powering trillions of tokens/day across 400,000+ GPUs."
  - id: spheron-cpt
    title: "GPU Cost Per Token: Benchmark 7 Major LLMs Across GPU Types in 2026"
    publisher: "Spheron Network Blog"
    year: 2026
    url: "https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/"
    accessed: "2026-07-03"
    kind: benchmark
    note: "Llama 3.3 70B on 8×H100 vLLM: ~$2.30/1M tokens at batch 256 (2,800 tok/s) but ~$258/1M at batch 1 (~5% utilization) — a ~100x swing on the same hardware."
  - id: braincuber-breakeven
    title: "Self-Hosted LLMs vs API-Based LLMs: Cost & Performance Analysis"
    publisher: "Braincuber"
    year: 2026
    url: "https://www.braincuber.com/blog/self-hosted-llms-vs-api-based-llms-cost-performance-analysis"
    accessed: "2026-07-03"
    kind: blog
    note: "Break-even near ~11B tokens/month (~500M/day, ~$4,200/mo API spend); DevOps ~$145k/yr; a GPU at 10% load inflates per-token cost 10x; real cost 3–5x raw GPU price."
  - id: together-pricing
    title: "Pricing"
    publisher: "Together AI"
    year: 2026
    url: "https://www.together.ai/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "Llama 3.3 70B ~$1.04/1M in & out (serverless); dedicated 1×H100 80GB endpoint $5.49/hr."
  - id: deepinfra-pricing
    title: "Pricing"
    publisher: "DeepInfra"
    year: 2026
    url: "https://deepinfra.com/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "Llama 3.3 70B Turbo $0.10/1M input, $0.32/1M output — an open-weight-via-API floor with zero ops."
  - id: groq-pricing
    title: "Pricing"
    publisher: "Groq"
    year: 2026
    url: "https://groq.com/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "Llama 3.3 70B Versatile $0.59/1M input, $0.79/1M output at ~394 tok/s."
---

## Overview

For a well-scoped, high-volume task you may be paying frontier-API prices to a hosted
model when a **smaller open-weight model** (Llama, Qwen, DeepSeek, Mistral) would clear
the quality bar for a fraction of the compute. *Local / open-weight substitution* is the
Level-3 move of taking that workload off a hosted frontier endpoint and running the open
model on **hardware you control** — rented or owned GPUs behind a serving stack like vLLM
or SGLang — so you pay for **GPU-hours instead of per-token API charges**.[^vllm-docs][^sglang-docs]

The appeal is real but conditional. A GPU is a **fixed hourly cost** whether it is busy or
idle, while an API is **purely variable** (you pay only for tokens you actually send).
Self-hosting therefore only wins when you can keep that fixed cost spread across enough
tokens — i.e. at **high, steady utilization**. That is the single caveat this page exists
to make loud:

> **Below very high, sustained volume, a managed API almost always wins on total cost —
> and the cheapest managed option is usually an open-weight model served *via* an API
> (Together, Fireworks, Groq, DeepInfra), which gives you the small-model savings with
> zero ops.** Self-host only when volume, utilization, or data-residency rules genuinely
> justify owning the serving stack.[^braincuber-breakeven][^deepinfra-pricing]

This is why it sits at **Level 3**: it is real engineering investment (a serving stack,
autoscaling, evals, on-call) with strong ROI **at scale** and **negative** ROI below the
break-even — the opposite of a safe default.

## Detailed Approach & Techniques

### The break-even math

The comparison is **GPU-hour cost + ops burden** vs. **per-token API price × volume**.
Concretely, self-host cost per million tokens is:

```
$/1M tokens (self-host) =  (GPU $/hr × number of GPUs)
                           ─────────────────────────────────────   +  ops & idle overhead
                           (throughput in tokens/sec × 3600 / 1e6)
```

The denominator — realized throughput — is where the economics are won or lost, because a
modern serving engine's throughput depends **entirely on keeping the batch full**. vLLM's
PagedAttention + continuous batching and SGLang's RadixAttention exist to pack many
concurrent requests onto one GPU; continuous batching alone is ~8× over static batching and
vLLM reaches ~23× when combined with PagedAttention.[^vllm-docs][^anyscale-batching][^sglang-docs]

A public benchmark makes the utilization sensitivity vivid: Llama 3.3 70B on an 8×H100 node
via vLLM lands around **$2.30 per 1M tokens at batch size 256** (~2,800 tok/s), but the
*same hardware* costs **~$258 per 1M tokens at batch size 1** (~5% GPU utilization) — a
roughly **100× swing** driven purely by how full you keep the GPU.[^spheron-cpt] An idle or
half-full fleet does not "cost a bit more"; it **destroys** the case: a GPU at 10% load
inflates per-token cost ~10×.[^braincuber-breakeven]

Rolling that up, a representative analysis puts the crossover near **~11 billion tokens per
month (~500M/day), roughly $4,200/month of equivalent API spend**, below which the API is
cheaper.[^braincuber-breakeven] Treat that as an order-of-magnitude marker, not a constant —
it moves with your task, the model size, GPU rental rates, and (critically) the API price
you are comparing against.

### What you actually take on

Self-hosting is not "swap a base URL." You inherit:

- **A serving stack** — vLLM, SGLang, or TGI — with tensor/pipeline parallelism, KV-cache
  and prefix-cache config, quantization, and throughput tuning.[^vllm-docs][^sglang-docs]
- **Autoscaling and utilization management** — the hardest operational problem, because
  idle GPUs are the economics killer. You need traffic steady enough (or a scale-to-zero /
  bursting design good enough) to hold high average utilization.[^spheron-cpt][^braincuber-breakeven]
- **An eval harness** — to prove the open model holds quality vs. the frontier baseline on
  *your* task, and to catch regressions when you upgrade models or quantization.
- **The true cost multiplier** — raw GPU rental is only part of it: a dedicated DevOps/ML
  engineer (~$145k/yr), model-update cycles, networking, load balancing, and storage push
  the **real cost to ~3–5× the raw GPU line item**.[^braincuber-breakeven]
- **The quality gap** — a small open model rarely matches a frontier model on hard,
  open-ended reasoning; substitution works when the task is narrow enough that a right-sized
  model suffices (pairs with *Model Right-Sizing* and *Fine-Tuning Cheaper Models*).

### The honest middle path: open-weight *via* managed API first

Before renting a single GPU, capture most of the savings with **none of the ops** by
serving the open-weight model through a managed inference provider. The small-model price
gap is already enormous: Llama 3.3 70B runs about **$0.10 in / $0.32 out per 1M tokens on
DeepInfra**, **$0.59 / $0.79 on Groq** (~394 tok/s), and **~$1.04 in & out on Together AI**
serverless[^deepinfra-pricing][^groq-pricing][^together-pricing] — versus flagship frontier
prices many multiples higher. That is a variable, zero-ops cost you can adopt today (and
route to per-request; see *Provider Routing* and *Dynamic Model Routing*).

Self-hosting only earns its keep when you climb **past** the managed-open price too. A
rough gate: Together's own **dedicated 1×H100 endpoint is $5.49/hr** ≈ $4,000/mo per
GPU[^together-pricing] — you must saturate that GPU with enough tokens that its amortized
per-token cost beats the ~$0.10–$1.04/1M serverless open-weight rate, or the managed API
wins outright. In practice that means: **open-weight via API by default; self-host only at
sustained high volume, or when data-residency/compliance forces the workload onto your own
infrastructure.**

## Example Where It Works

A document-processing platform runs a **fixed extraction + classification pipeline** over
inbound PDFs at **~600M tokens/day** — steady around the clock, narrow task, and a
fine-tuned Llama-3.3-70B-class open model already matches the frontier baseline on the
company's eval suite.

Because the traffic is high and **continuous**, an 8×H100 vLLM deployment can be held near
full batches, landing around **~$2.30/1M tokens** rather than the ~$258/1M a poorly-utilized
node would cost.[^spheron-cpt] At ~18B tokens/month the workload sits **above the ~11B/month
crossover**, so even after loading in the ~3–5× ops/idle multiplier, self-hosting comes out
several-fold cheaper than frontier-API pricing — and cheaper than serverless open-weight too,
once the GPUs are saturated.[^braincuber-breakeven][^together-pricing] Data-residency
requirements on the customer PDFs make owning the stack a bonus rather than a burden.

## Example Where It Would NOT Work

A B2B SaaS feature does **~8M tokens/day** in **spiky, business-hours** bursts across varied
tasks (some needing frontier-level reasoning).

- **Volume is far below break-even.** At ~0.24B tokens/month it is nowhere near the
  ~11B/month crossover; the API is cheaper by a wide margin.[^braincuber-breakeven]
- **Utilization would be terrible.** Business-hours spikes mean a dedicated GPU sits mostly
  idle — and an idle GPU inflates per-token cost ~10×, so the fixed hourly charge dwarfs
  what per-token billing would have cost.[^spheron-cpt][^braincuber-breakeven]
- **Ops overhead has no volume to amortize against.** A DevOps engineer, an eval harness,
  and model-update cycles are pure loss on a small workload.[^braincuber-breakeven]
- **The cheaper move already exists.** If the goal is just "stop paying frontier prices for
  the easy majority," route those requests to an **open-weight model via a managed API**
  (~$0.10–$0.79/1M on DeepInfra/Groq) and keep the hard residual on the frontier model — all
  variable cost, no serving stack.[^deepinfra-pricing][^groq-pricing] Here self-hosting is a
  strictly worse, more expensive, more fragile choice.

[^vllm-docs]: vLLM Documentation, "vLLM — Easy, fast, and cheap LLM serving" — <https://docs.vllm.ai/en/stable/>
[^anyscale-batching]: Cade Daniel et al., Anyscale, "How continuous batching enables 23x throughput in LLM inference while reducing p50 latency" — <https://www.anyscale.com/blog/continuous-batching-llm-inference>
[^sglang-docs]: SGLang Documentation, "Fast Serving Framework for LLMs and VLMs" — <https://docs.sglang.io/>
[^spheron-cpt]: Spheron Network, "GPU Cost Per Token: Benchmark 7 Major LLMs Across GPU Types in 2026" — <https://www.spheron.network/blog/gpu-cost-per-token-benchmark-llm-inference-2026/>
[^braincuber-breakeven]: Braincuber, "Self-Hosted LLMs vs API-Based LLMs: Cost & Performance Analysis" — <https://www.braincuber.com/blog/self-hosted-llms-vs-api-based-llms-cost-performance-analysis>
[^together-pricing]: Together AI, "Pricing" — <https://www.together.ai/pricing>
[^deepinfra-pricing]: DeepInfra, "Pricing" — <https://deepinfra.com/pricing>
[^groq-pricing]: Groq, "Pricing" — <https://groq.com/pricing>
