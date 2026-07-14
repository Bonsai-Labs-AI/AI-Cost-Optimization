---
title: "Multi-LoRA Serving"
category: fine-tuning
maturityLevel: 4
maturityProvisional: false
shortDescription: "Serve many LoRA adapters (100s–1000s) off a single shared base model on one GPU, swapping adapters per request, so owning dozens of narrow fine-tuned models costs roughly one base model's serving footprint instead of N separate deployments."
effort: High
gain: High
riskToQuality: Medium
detectionSignals:
  - "Many separately-deployed fine-tuned models, each pinned to its own GPU (or its own dedicated endpoint) and mostly idle."
  - "A per-tenant or per-task fine-tuning strategy where the number of distinct models (N) keeps growing."
  - "GPU/serving cost scaling roughly linearly with the number of fine-tuned models, not with total traffic."
  - "Each fine-tuned variant derives from the same base model and shares the same architecture."
measurementMethods:
  - "Adapters served concurrently per GPU (and total loadable via CPU/disk tiering)."
  - "$/model-served on a shared base vs. the cost of N dedicated single-model deployments."
  - "Aggregate throughput and p99 latency with N active adapters vs. serving the base model alone."
  - "Base-GPU utilization before (many idle single-model boxes) vs. after (one saturated shared box)."
status: published
lastUpdated: "2026-07-03"
related:
  - "fine-tuning/fine-tuning-cheaper-models"
  - "fine-tuning/local-model-deployment"
  - "fine-tuning/calibrated-quantization"
  - "fine-tuning/task-specific-classifiers"
  - "fine-tuning/task-specific-extractors"
sources:
  - id: slora
    title: "S-LoRA: Serving Thousands of Concurrent LoRA Adapters"
    publisher: "arXiv (Sheng, Cao, Li, et al.)"
    year: 2023
    url: "https://arxiv.org/abs/2311.03285"
    accessed: "2026-07-03"
    kind: paper
    note: "Stores all adapters in host memory, fetches active ones to GPU; Unified Paging manages heterogeneous adapter weights + KV cache in one memory pool. Serves thousands of adapters on a single GPU with small overhead; up to 4x throughput over HuggingFace PEFT and vLLM's naive LoRA support, and increases the number of served adapters by several orders of magnitude."
  - id: punica
    title: "Punica: Multi-Tenant LoRA Serving"
    publisher: "MLSys / arXiv (Chen, Ye, Zheng, et al.)"
    year: 2024
    url: "https://arxiv.org/abs/2310.18547"
    accessed: "2026-07-03"
    kind: paper
    note: "SGMV kernel batches requests hitting different adapters into one grouped matmul over a single shared base copy; 12x higher throughput than state-of-the-art serving systems while adding only ~2ms latency per token, holding one copy of the base model for many different LoRA models."
  - id: vllm-lora
    title: "LoRA Adapters"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/stable/features/lora/"
    accessed: "2026-07-03"
    kind: docs
    note: "enable_lora, max_loras (adapters loaded per batch in GPU), max_lora_rank, max_cpu_loras (LRU-cached in host RAM); per-request lora_request selects the adapter; runtime /v1/load_lora_adapter and /v1/unload_lora_adapter endpoints add/remove adapters without restart."
  - id: lorax-repo
    title: "predibase/lorax — Multi-LoRA inference server that scales to 1000s of fine-tuned LLMs"
    publisher: "GitHub (Predibase)"
    year: 2026
    url: "https://github.com/predibase/lorax"
    accessed: "2026-07-03"
    kind: repo
    note: "Dynamic adapter loading (adapter fetched just-in-time per request without blocking others); tiered weight caching offloading adapters to CPU/disk; heterogeneous continuous batching packs requests for different adapters into one batch, keeping latency and throughput nearly constant as concurrent-adapter count grows."
  - id: lora-paper
    title: "LoRA: Low-Rank Adaptation of Large Language Models"
    publisher: "arXiv (Hu, Shen, Wallis, et al.)"
    year: 2021
    url: "https://arxiv.org/abs/2106.09685"
    accessed: "2026-07-03"
    kind: paper
    note: "LoRA freezes base weights and trains small low-rank matrices; reduces trainable parameters vs. full fine-tuning of GPT-3 175B by 10,000x and GPU memory by 3x — so an adapter is a tiny artifact relative to the base model."
  - id: slora-explainer
    title: "How to run thousands of LoRA language models on one GPU"
    publisher: "TechTalks"
    year: 2023
    url: "https://bdtechtalks.com/2023/12/13/s-lora-llm-fine-tuning/"
    accessed: "2026-07-03"
    kind: blog
    note: "Secondary explainer of S-LoRA: the batching insight is that many adapters share the same base, so per-request adapter deltas can be applied on top of a single batched base forward pass instead of running N separate models."
---

## Overview

A LoRA (Low-Rank Adaptation) fine-tune does not produce a new full-size model. It
freezes the base model's weights and trains a small pair of low-rank matrices per
adapted layer — an "adapter" that is a **tiny fraction** of the base. LoRA's authors
report reducing trainable parameters versus full fine-tuning of GPT-3 175B by
**10,000×** and GPU memory by **3×**.[^lora-paper] In practice a useful adapter for a
multi-billion-parameter base is **tens to a few hundred MB**, against a base that is
**tens of GB** in GPU memory.

That size asymmetry creates a cost problem *and* its solution. The naive way to ship
"a fine-tuned model per task" or "a fine-tuned model per tenant" is to deploy each one
separately — merge the adapter into the base and stand up a dedicated endpoint on its
own GPU. With **N** narrow models that is **N** copies of a ~tens-of-GB base, N GPUs,
and N mostly-idle boxes. Serving cost then scales with the **number of models**, not
with traffic — the exact anti-pattern that kills the "many specialized models"
strategy.

**Multi-LoRA serving** collapses that. It keeps **one** copy of the shared base model
resident and treats the adapters as small, swappable deltas: incoming requests each
name which adapter they want, and the server applies the right adapter per request
while running a **single batched forward pass over the shared base**.[^punica][^slora-explainer]
Because the base weights (the expensive part) are shared and the per-request delta is
cheap, one GPU can serve **hundreds to thousands** of distinct fine-tuned models at
throughput close to serving the base alone.[^slora][^lorax-repo] The per-model serving
cost effectively collapses from "one GPU each" to "one shared GPU for all of them" —
which is why this is the piece that makes owning dozens of narrow fine-tunes
economically sane. It sits at **Level 4** because it is a real self-hosted serving
build (custom kernels, adapter memory tiering, an inference stack you own and operate),
and it only pays off once N is genuinely large.

## Detailed Approach & Techniques

### The mechanism: shared base, per-request adapter

The core trick is that every adapter is a delta on the *same* frozen base. So instead
of loading N models, the server loads the base **once** and, for each request, adds the
requested adapter's low-rank contribution. The hard part is doing that efficiently when
a single batch contains requests hitting **different** adapters.

- **Punica** solves the batching with a **Segmented Gather Matrix-Vector Multiplication
  (SGMV)** kernel: requests in a batch that target different adapters are grouped and
  fused into one batched matmul over the single shared base copy. Punica reports **12×
  higher throughput** than state-of-the-art serving systems while adding only **~2 ms of
  latency per token**, holding **one copy** of the base model for many different LoRA
  models.[^punica]
- **S-LoRA** scales the *number* of adapters. It keeps all adapters in host memory and
  fetches only the active ones to the GPU, and its **Unified Paging** manages
  heterogeneous adapter weights (different ranks) and KV-cache tensors (different
  sequence lengths) in **one memory pool** to fight fragmentation. It can **serve
  thousands of LoRA adapters on a single GPU with small overhead**, delivering **up to
  4× throughput** over HuggingFace PEFT and over vLLM's naive LoRA support, and
  **increasing the number of served adapters by several orders of magnitude**.[^slora]

The economic consequence is the point: N adapters share the base's GPU memory and the
base's compute, so **per-model serving cost collapses**. You pay for roughly one base
model's footprint and amortize it across all N tenants/tasks, instead of paying for N
deployments.[^lorax-repo][^slora]

### Production serving stacks

- **vLLM** ships multi-LoRA as a first-class feature. Start the engine with
  `enable_lora=True`, set `max_loras` (how many distinct adapters are live in a GPU batch),
  `max_lora_rank`, and `max_cpu_loras` (adapters LRU-cached in host RAM). Each request
  carries a `lora_request` naming its adapter, and adapters can be added/removed at
  runtime via the `/v1/load_lora_adapter` and `/v1/unload_lora_adapter` endpoints without
  restarting the server.[^vllm-lora]
- **LoRAX** (Predibase) is a dedicated multi-LoRA server that advertises scaling to
  **1000s of fine-tuned LLMs** on shared infrastructure. Its three mechanisms map onto
  the cost story: **dynamic adapter loading** (an adapter is fetched just-in-time per
  request, without blocking other requests), **tiered weight caching** (adapters offload
  to CPU/disk so you can register far more than fit in GPU memory), and **heterogeneous
  continuous batching** (requests for different adapters are packed into one batch,
  keeping latency and throughput **nearly constant** as the concurrent-adapter count
  grows).[^lorax-repo]

### The two-tier memory picture

The reason "thousands of adapters" is feasible on one GPU is the memory tiering. Only a
working set of hot adapters needs to sit in GPU memory (`max_loras`); the long tail lives
in host RAM or on disk and is paged in on demand.[^vllm-lora][^lorax-repo] Since each
adapter is only tens-to-hundreds of MB while the base is tens of GB, the base dominates
the fixed cost and each additional adapter is nearly free to *register* — it only
consumes real GPU resources while it is actively serving traffic.[^lora-paper][^slora]

### Implementation prerequisites

- A **single shared base model** that all adapters were trained against (same base, same
  architecture, and typically the same rank ceiling you set `max_lora_rank` to).
- A serving stack that supports batched multi-adapter inference (vLLM, LoRAX/TGI,
  S-LoRA-style kernels) — you are running your own inference infrastructure, not an API.
- An adapter registry + loading pipeline (object storage of adapter weights, per-request
  routing to the right adapter).
- Per-adapter evaluation: adapters share a base, so a base upgrade means **re-training and
  re-validating every adapter**, and a bad adapter can regress just its own tenant.

## Example Where It Works

A B2B document-processing SaaS offers **150 customers** each a model tuned on *their*
schema, tone, and entity vocabulary — all fine-tuned as LoRA adapters over the same
open-weight base (e.g. a Llama- or Qwen-class model). Traffic per customer is bursty and
low-average; no single customer justifies a dedicated GPU.

- **Naive (N deployments):** 150 merged models, each on its own GPU-backed endpoint. That
  is ~150 copies of a tens-of-GB base and ~150 GPUs, most sitting idle most of the time —
  cost scales with the customer count, and the unit economics never close.
- **Multi-LoRA:** one shared base on a small pool of GPUs, with 150 adapters registered.
  Hot adapters stay in GPU memory; the rest page in from host RAM/disk on demand, and
  requests for different customers batch together over the shared base.[^lorax-repo][^slora]
  Because a serving system can hold **thousands** of adapters per GPU and keep throughput
  near the base-only level, those 150 customers now cost **roughly one base model's serving
  footprint** rather than 150.[^slora][^punica] GPU utilization on the shared box goes from
  "150 idle boxes" to "one saturated box," and the "a tuned model per customer" product
  becomes affordable. The next new customer costs an adapter, not a GPU.

## Example Where It Would NOT Work

- **One or two models.** With N = 1 or 2, there is no adapter-*sharing* benefit to
  harvest — a single dedicated deployment already saturates its GPU, and the multi-LoRA
  machinery (kernels, adapter tiering, routing) is pure added complexity. Below a
  meaningful N, just deploy the model(s) directly (see *Local Model Deployment*).
- **Adapters over different base models.** The whole economy rests on a **single shared
  base**. If your "many models" are actually different base models — different families,
  sizes, or architectures — they cannot share one base copy, and you are back to N
  deployments. Multi-LoRA only compresses a fleet that is *one base + many adapters*.
- **Full fine-tunes, not LoRA.** If the specialized models were produced by *full*
  fine-tuning (all weights changed), there is no low-rank delta to swap; each is a
  distinct full model and must be served on its own. This technique presupposes the
  fine-tuning was done as LoRA/QLoRA in the first place.[^lora-paper]
- **No self-hosting appetite / sub-scale volume.** This is a self-operated serving stack
  with real ops burden. A team without ML-serving operations, or one whose total volume is
  too low to keep even one shared GPU busy, is better off using a managed fine-tuning API
  (see *Fine-Tuning Cheaper Models*) until the model count and volume justify owning the
  serving layer.

[^slora]: S-LoRA, "Serving Thousands of Concurrent LoRA Adapters," arXiv 2023 — <https://arxiv.org/abs/2311.03285>
[^punica]: Punica, "Multi-Tenant LoRA Serving," MLSys/arXiv 2024 — <https://arxiv.org/abs/2310.18547>
[^vllm-lora]: vLLM Documentation, "LoRA Adapters" — <https://docs.vllm.ai/en/stable/features/lora/>
[^lorax-repo]: Predibase, "predibase/lorax — Multi-LoRA inference server that scales to 1000s of fine-tuned LLMs," GitHub — <https://github.com/predibase/lorax>
[^lora-paper]: Hu et al., "LoRA: Low-Rank Adaptation of Large Language Models," arXiv 2021 — <https://arxiv.org/abs/2106.09685>
[^slora-explainer]: TechTalks, "How to run thousands of LoRA language models on one GPU," 2023 — <https://bdtechtalks.com/2023/12/13/s-lora-llm-fine-tuning/>
