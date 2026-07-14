---
title: "Local Model Deployment"
category: fine-tuning
maturityLevel: 4
maturityProvisional: false
shortDescription: "Self-host a model you fine-tuned for one narrow task on your own (owned or rented) GPUs at production scale — at very high, steady volume with high GPU utilization this beats any API on $/token for that task, but it is net-negative below break-even."
effort: High
gain: High
riskToQuality: High
effortWhy: "You own the whole serving stack — vLLM/SGLang config, continuous batching, quantized serving, autoscaling, on-call, GPU capacity planning — an ML-serving-ops function, not a config change."
gainWhy: "A fine-tuned small model at high utilization can undercut any API on $/token for its narrow task; savings are Very High at sustained scale, but only there."
riskWhy: "Economics live or die on utilization; idle or spiky GPUs, sub-break-even volume, or a missing ops team turn this net-negative, and you own reliability/uptime."
detectionSignals:
  - "Very high, sustained volume on a fine-tuned narrow model that is still paying per-token API prices."
  - "GPU utilization would stay high — steady traffic that can saturate a dedicated GPU, not spiky bursts."
  - "Data-residency, latency, or compliance requirements force inference on-prem or in a controlled VPC."
  - "A managed fine-tuning path is winding down or unavailable for the base model you need."
measurementMethods:
  - "Fully-loaded $/1M tokens self-hosted (GPU-hours incl. idle + ops labor + 1.3–2× overhead) vs. the API $/1M for the same task."
  - "GPU utilization % (tokens/sec sustained ÷ peak throughput) — the number the whole business case rides on."
  - "Break-even token volume/day at your utilization, and how it moves as utilization drops."
  - "p50/p99 latency and throughput (tokens/sec) under continuous batching at target concurrency."
status: published
lastUpdated: "2026-07-03"
related:
  - "fine-tuning/local-open-weight-substitution"
  - "fine-tuning/fine-tuning-cheaper-models"
  - "fine-tuning/calibrated-quantization"
  - "fine-tuning/multi-lora-serving"
sources:
  - id: vllm-repo
    title: "vLLM — Easy, fast, and cheap LLM serving for everyone"
    publisher: "vLLM (GitHub)"
    year: 2026
    url: "https://github.com/vllm-project/vllm"
    accessed: "2026-07-03"
    kind: repo
    note: "State-of-the-art serving throughput via PagedAttention KV-cache management + continuous batching + chunked prefill + prefix caching; quantization (FP8, INT8, INT4, GPTQ/AWQ, NVFP4); efficient multi-LoRA; OpenAI-compatible server and distributed/tensor-parallel serving."
  - id: vllm-docs
    title: "vLLM Documentation — overview"
    publisher: "vLLM"
    year: 2026
    url: "https://docs.vllm.ai/en/latest/"
    accessed: "2026-07-03"
    kind: docs
    note: "Continuous batching cited as yielding ~23× throughput vs naive serving while reducing p50 latency; supports FP8/INT8/INT4/GPTQ/AWQ quantized serving and CUDA-graph execution."
  - id: sglang-docs
    title: "SGLang — high-performance serving framework"
    publisher: "SGLang / LMSYS"
    year: 2026
    url: "https://docs.sglang.io/"
    accessed: "2026-07-03"
    kind: docs
    note: "Production serving framework (RadixAttention prefix caching, continuous batching, CUDA-graph replay, multi-GPU parallelism); states it powers trillions of tokens/day across 400,000+ GPUs worldwide."
  - id: sglang-paper
    title: "SGLang: Efficient Execution of Structured Language Model Programs"
    publisher: "arXiv (2312.07104)"
    authors: "Zheng et al."
    year: 2024
    url: "https://arxiv.org/abs/2312.07104"
    accessed: "2026-07-03"
    kind: paper
    note: "Reports up to 6.4× higher throughput vs state-of-the-art inference systems via RadixAttention (automatic KV-cache reuse over shared prefixes)."
  - id: tgi-docs
    title: "Text Generation Inference (TGI)"
    publisher: "Hugging Face"
    year: 2026
    url: "https://huggingface.co/docs/text-generation-inference/index"
    accessed: "2026-07-03"
    kind: docs
    note: "Production-ready serving toolkit (continuous batching, tensor parallelism, Flash/Paged Attention, quantization, Prometheus/OpenTelemetry). NOW IN MAINTENANCE MODE — HF recommends migrating to vLLM or SGLang going forward."
  - id: redhat-autoscale
    title: "Autoscaling vLLM with OpenShift AI"
    publisher: "Red Hat Developer"
    year: 2025
    url: "https://developers.redhat.com/articles/2025/10/02/autoscaling-vllm-openshift-ai"
    accessed: "2026-07-03"
    kind: blog
    note: "Autoscale vLLM via Knative concurrency metric (default 100 req/pod is too high for a model server — tune lower); scale-to-zero removes idle GPU cost but model cold-start (even Llama-3.1-8B) makes it unsuitable for latency-sensitive user traffic."
  - id: kserve
    title: "KServe — standardized model inference platform on Kubernetes"
    publisher: "KServe"
    year: 2026
    url: "https://kserve.github.io/website/"
    accessed: "2026-07-03"
    kind: docs
    note: "Kubernetes-native serving with request/concurrency-based autoscaling, GPU-backed scaling, and scale-to-zero for cost control."
  - id: devtk-breakeven
    title: "Self-Host LLM vs API: Real Cost Breakdown 2026"
    publisher: "DevTk.AI"
    year: 2026
    url: "https://devtk.ai/en/blog/self-hosting-llm-vs-api-cost-2026/"
    accessed: "2026-07-03"
    kind: blog
    note: "Single A100-80GB (~$1,440/mo GPU) serving Llama-70B at ~1,500 tok/s ≈ 3.9B tok/mo capacity; break-even ~256M tok/mo (~8.5M/day) vs GPT-5, ~160M/mo vs Claude Sonnet, but billions/mo vs budget APIs (DeepSeek/Gemini Flash). Fully-loaded cost = GPU × 1.3–2.0× after DevOps/infra/monitoring."
  - id: lambda-pricing
    title: "AI Cloud Pricing — GPU Compute"
    publisher: "Lambda"
    year: 2026
    url: "https://lambda.ai/pricing"
    accessed: "2026-07-03"
    kind: pricing
    note: "On-demand rates (Jul 2026): H100 SXM $3.99/GPU-hr (8×) up to $4.29 (1×); A100-80GB SXM $2.79/GPU-hr (8×); A100-40GB from $1.99/GPU-hr."
---

## Overview

At Level 3, *local open-weight substitution* swaps in a general open model to dodge API
prices. **Local model deployment is the operationalized, owned-infrastructure end of that
idea**: you take a model you **fine-tuned for one narrow task** and run it yourself, at
production scale, on GPUs you own or rent — with a real serving stack (vLLM / SGLang),
continuous batching, quantized weights, and autoscaling behind it.

The cost logic is simple and brutal. An API charges you per token whether your traffic is
one request or a billion; a GPU costs the same **whether it is 5% busy or 95% busy**. So a
small fine-tuned model, served at **high, steady utilization**, can undercut *any* API on
$/token for its narrow task — the marginal token is nearly free once the GPU is paid
for.[^devtk-breakeven][^lambda-pricing] But that advantage only exists **above a break-even
volume and at a utilization you can actually sustain**. Below it, you are paying for idle
silicon and an on-call rotation to beat a bill you could have paid with a credit card.

That is why this is **Level 4**: it is not a config change, it is standing up and running an
ML-serving function — capacity planning, throughput tuning, reliability, on-call. The gain
is **High (Very High at true scale)**; the risk is **High**, because the economics collapse
the moment utilization does. The honest framing for a client is: *do this only when a
fine-tuned narrow model is running at very high sustained volume that you can keep the GPUs
saturated with.* Everything below that, stay on the API (or a managed-open endpoint) and
revisit `local-open-weight-substitution` and `fine-tuning-cheaper-models` first.

## Detailed Approach & Techniques

### The serving stack

You do not serve a production model with `model.generate()`. The throughput that makes
self-hosting economical comes from a dedicated inference server:

- **vLLM** — the de-facto default. **PagedAttention** manages the KV cache in non-contiguous
  pages (so batches pack tightly), and **continuous batching** admits and retires requests at
  every decode step instead of waiting for a whole batch to finish — together delivering
  *state-of-the-art* throughput, cited at up to **~23× over naive serving** with lower p50
  latency. It also does chunked prefill, prefix caching, quantized serving, and efficient
  **multi-LoRA**.[^vllm-repo][^vllm-docs]
- **SGLang** — comparable production serving with **RadixAttention**, which stores the KV
  cache as a radix tree so any shared prefix is reused automatically; the paper reports **up
  to 6.4× higher throughput** vs prior systems, and the project states it serves *trillions of
  tokens/day across 400,000+ GPUs*.[^sglang-docs][^sglang-paper]
- **TGI (Text Generation Inference)** — Hugging Face's production toolkit (continuous
  batching, tensor parallelism, Prometheus metrics). **Freshness caveat:** TGI is now in
  **maintenance mode**; HF explicitly recommends migrating to **vLLM or SGLang** for new
  deployments.[^tgi-docs]

**Continuous batching is the whole ballgame.** It is what turns one GPU into a machine that
serves many concurrent requests at once — high utilization is *only* reachable because the
batch stays full. Layer on **quantized serving** (FP8 / INT8 / INT4 / GPTQ / AWQ, all
first-class in vLLM) to fit the model on fewer/cheaper GPUs and push throughput further — see
`calibrated-quantization`.[^vllm-repo]

### Autoscaling and the utilization problem

Real traffic is not flat, so you autoscale. On Kubernetes, **KServe** provides
request/concurrency-based autoscaling, GPU-backed scaling, and **scale-to-zero** for idle
cost control.[^kserve] For vLLM specifically, Red Hat's reference autoscales on the **Knative
concurrency** metric — and warns the default target (100 req/pod) is far too high for a model
server and must be tuned down. **Scale-to-zero eliminates idle-GPU cost but is a trap for
user-facing traffic**: even a small model (Llama-3.1-8B) has a non-trivial cold-start, so a
scaled-to-zero replica adds seconds of latency on the first request after idle.[^redhat-autoscale]
This is the core tension of self-hosting: you either keep GPUs warm (paying for idle) or
scale to zero (paying in cold-start latency). Neither is free — the API's "no idle cost"
is exactly the thing you are giving up.

### Economics at scale (with the break-even math)

Take a concrete, sourced case: a single **A100-80GB** rented at roughly **$1,440/month** can
serve **Llama-70B at ~1,500 tokens/sec**, i.e. **~3.9B tokens/month** of *capacity*.[^devtk-breakeven]
(Rental rates for reference: Lambda lists A100-80GB SXM at **$2.79/GPU-hr** and H100 SXM at
**$3.99–$4.29/GPU-hr**.[^lambda-pricing]) Against **GPT-5-class API pricing**, that GPU
breaks even at about **256M tokens/month (~8.5M/day)**; against **Claude Sonnet-class**
pricing, ~**160M/month**. But against **budget APIs** (DeepSeek/Gemini Flash at ~$0.2/1M
blended), break-even balloons to **billions of tokens/month — more than a single GPU's entire
capacity**.[^devtk-breakeven]

Two multipliers dominate the real answer:

1. **Fully-loaded cost, not GPU rent.** Add DevOps labor, infra, and monitoring and the true
   monthly cost is roughly **1.3×–2.0× the raw GPU bill**.[^devtk-breakeven] Break-even volume
   rises with it.
2. **Utilization is the denominator.** $/token = (fully-loaded GPU cost) ÷ (tokens actually
   served). At 90% utilization the math above holds; at **30% utilization you serve a third of
   the tokens for the same rent, so your $/token roughly triples** and break-even roughly
   triples with it. **This one number decides the whole business case** — which is why the
   measurement section leads with it.

The fine-tuning twist that makes this *worth* the effort at L4: you are not serving Llama-70B,
you are serving a **small model fine-tuned to match a big model on one narrow task**. A tuned
7B–13B model needs far less GPU per token, so its capacity per dollar is much higher and its
break-even far lower than the 70B example — *provided quality holds on that task*.

### Vendor-availability caveat

The center of gravity has shifted toward **open-weight + LoRA/QLoRA** and **managed-open**
endpoints (Bedrock/Vertex) as first-party self-serve fine-tuning options narrow. Before owning
GPUs, price the **managed-open** path — it gives you a fine-tuned open model with someone
else's serving ops. Self-hosting only wins once volume/utilization clears the break-even *and*
you value the control (residency, latency, no idle markup) enough to run the stack. And if you
have *many* narrow models, `multi-lora-serving` collapses N deployments onto one base GPU —
often the difference between viable and not.

## Example Where It Works

A document-processing SaaS runs a **single narrow task** — extract structured fields from
scanned invoices — at **~2 billion tokens/day**, steady 24/7 across global tenants. They
fine-tuned an **8B open model** that matches their old GPT-4-class extractor on their eval set.

- **On the API:** at even $2.50/1M input, 2B tokens/day is **~$150k/month** just for this one
  task — and it never gets cheaper per token.
- **Self-hosted:** the 8B model quantized to INT8 serves at high throughput on a small pool of
  A100/H100s under vLLM continuous batching; steady round-the-clock traffic keeps utilization
  **north of 80%**, so autoscaling adds a couple of replicas at peak rather than idling.
  Fully-loaded (GPUs × ~1.7 for ops), the same volume runs a **large multiple cheaper per
  token**, and the gap widens as volume grows.[^devtk-breakeven][^vllm-repo][^lambda-pricing]

Every condition that makes L4 pay is present: **one narrow task, a fine-tuned small model,
enormous sustained volume, and utilization high enough to saturate the GPUs.**

## Example Where It Would NOT Work

- **Sub-break-even volume.** A startup doing **3M tokens/day** on a fine-tuned model would keep
  a GPU ~mostly idle; at that volume even GPT-5-class API pricing is below the single-GPU
  break-even (~8.5M/day), and budget-API break-even is *billions*/day — self-hosting is
  strictly more expensive **and** adds an ops burden.[^devtk-breakeven]
- **Spiky traffic.** Business-hours-only or bursty load means GPUs sit idle nights/weekends.
  Scale-to-zero recovers the idle cost but injects cold-start latency on every wake, which is a
  non-starter for interactive UX — so you pay for warm idle instead.[^redhat-autoscale]
- **Broad / changing tasks.** The whole edge is a *narrow* fine-tuned model. If you need
  general reasoning across many domains, you are back to a large model whose self-hosted $/token
  no longer beats a frontier API for the quality — buy the API.
- **No ML-serving ops.** A team with no one to own capacity planning, throughput tuning,
  quantization, autoscaling config, and 24/7 on-call will hit low utilization, outages, and a
  fully-loaded cost near the 2× ceiling — erasing the savings.[^devtk-breakeven][^tgi-docs]

In all four, stay on the API or a **managed-open** endpoint and revisit
`local-open-weight-substitution` and `fine-tuning-cheaper-models` first.

[^vllm-repo]: vLLM, "Easy, fast, and cheap LLM serving for everyone" (GitHub) — <https://github.com/vllm-project/vllm>
[^vllm-docs]: vLLM Documentation — <https://docs.vllm.ai/en/latest/>
[^sglang-docs]: SGLang / LMSYS, serving framework docs — <https://docs.sglang.io/>
[^sglang-paper]: Zheng et al., "SGLang: Efficient Execution of Structured Language Model Programs," arXiv:2312.07104 — <https://arxiv.org/abs/2312.07104>
[^tgi-docs]: Hugging Face, "Text Generation Inference" — <https://huggingface.co/docs/text-generation-inference/index>
[^redhat-autoscale]: Red Hat Developer, "Autoscaling vLLM with OpenShift AI," 2025 — <https://developers.redhat.com/articles/2025/10/02/autoscaling-vllm-openshift-ai>
[^kserve]: KServe, model inference platform docs — <https://kserve.github.io/website/>
[^devtk-breakeven]: DevTk.AI, "Self-Host LLM vs API: Real Cost Breakdown 2026" — <https://devtk.ai/en/blog/self-hosting-llm-vs-api-cost-2026/>
[^lambda-pricing]: Lambda, "AI Cloud Pricing — GPU Compute" — <https://lambda.ai/pricing>
