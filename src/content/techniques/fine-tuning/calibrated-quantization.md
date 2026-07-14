---
title: "Calibrated Quantization (GPTQ / AWQ / QAT)"
category: fine-tuning
maturityLevel: 4
maturityProvisional: false
shortDescription: "Compress a self-hosted model's weights (and/or activations) to INT8/INT4/FP8 using calibration data — GPTQ/AWQ/SmoothQuant post-training, or QAT for the hardest low-bit cases — so it serves on fewer/cheaper GPUs at higher throughput and lower $/token, with minimal quality loss."
effort: High
gain: High
riskToQuality: Medium
effortWhy: "Post-training AWQ/GPTQ is roughly L3 effort (a calibration run); QAT — retraining with quantization in the loop — is the L4 piece, and validating quality retention at scale is real work."
gainWhy: "Halving or quartering weight memory lets the same model run on fewer/smaller GPUs at ~1.8–2.4× throughput, directly cutting self-hosted $/token — but only when you already operate your own serving stack."
riskWhy: "Under-calibrated or too-aggressive quantization (especially W4 activations or 2-bit) degrades quality; large models tolerate it better than small ones, so it needs per-task eval."
detectionSignals:
  - "Self-hosting a model in full precision (FP16/BF16) while GPU-memory-bound — the model barely fits, forcing a bigger or extra GPU."
  - "Paying for more or larger GPUs than a quantized version of the same model would need (e.g. a 70B model on 2× A100-80GB that would fit one at INT4)."
  - "Serving throughput capped by memory bandwidth / KV-cache room rather than compute."
  - "Running on Hopper/Ada GPUs with FP8 tensor cores that the current FP16 deployment leaves unused."
measurementMethods:
  - "GPU memory footprint (GB) for weights + KV cache before vs. after quantization, per bit-width."
  - "Serving throughput (tokens/s, requests/s) and $/1M tokens before vs. after."
  - "Number/size of GPUs required to host the model at target latency."
  - "Quality-retention: accuracy/perplexity on a task eval suite, quantized vs. full-precision baseline (target ≥99% recovery)."
  - "Calibration effort: calibration-set size and one-time quantization compute (GPU-hours)."
status: published
lastUpdated: "2026-07-03"
related:
  - "fine-tuning/local-model-deployment"
  - "fine-tuning/multi-lora-serving"
  - "fine-tuning/fine-tuning-cheaper-models"
  - "model-routing/local-open-weight-substitution"
  - "rag/embedding-quantization-mrl"
sources:
  - id: gptq
    title: "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers"
    publisher: "ICLR 2023 (arXiv:2210.17323)"
    authors: "Frantar, Ashkboos, Hoefler, Alistarh"
    year: 2023
    url: "https://arxiv.org/abs/2210.17323"
    accessed: "2026-07-03"
    kind: paper
    note: "One-shot 3–4 bit post-training weight quantization using approximate second-order (Hessian) information; quantizes a 175B model in ~4 GPU-hours with negligible accuracy loss, fits it on a single GPU, ~3.25× faster on A100 / ~4.5× on A6000 vs FP16."
  - id: awq
    title: "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration"
    publisher: "MLSys 2024 Best Paper (arXiv:2306.00978)"
    authors: "Lin, Tang, Tang, Yang, et al. (MIT Han Lab)"
    year: 2023
    url: "https://arxiv.org/abs/2306.00978"
    accessed: "2026-07-03"
    kind: paper
    note: "Protecting ~1% of salient weight channels (identified from activation statistics) via an equivalent scaling transform, no backprop/reconstruction. INT4 weight-only; >3× speedup over HF FP16; enables 70B Llama-2 on mobile GPUs via TinyChat."
  - id: smoothquant
    title: "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models"
    publisher: "ICML 2023 (arXiv:2211.10438)"
    authors: "Xiao, Lin, Seznec, Wu, Demouth, Han"
    year: 2022
    url: "https://arxiv.org/abs/2211.10438"
    accessed: "2026-07-03"
    kind: paper
    note: "Enables W8A8 (INT8 weights AND activations) by offline migrating activation-outlier quantization difficulty into the weights. Up to 1.56× speedup, 2× memory reduction, negligible accuracy loss; scales to a 530B model on a single node."
  - id: llm-qat
    title: "LLM-QAT: Data-Free Quantization Aware Training for Large Language Models"
    publisher: "arXiv:2305.17888"
    authors: "Liu, Oguz, Zhao, et al. (Meta)"
    year: 2023
    url: "https://arxiv.org/abs/2305.17888"
    accessed: "2026-07-03"
    kind: paper
    note: "Data-free QAT (uses the model's own generations for distillation) for weights, activations, and KV cache down to 4-bit. States PTQ methods 'perform well down to 8-bits' but 'break down at lower bit precision'; QAT gives large improvements especially in low-bit settings."
  - id: redhat-eval
    title: "We ran over half a million evaluations on quantized LLMs — here's what we found"
    publisher: "Red Hat / Neural Magic"
    authors: ""
    year: 2024
    url: "https://developers.redhat.com/articles/2024/10/17/we-ran-over-half-million-evaluations-quantized-llms"
    accessed: "2026-07-03"
    kind: benchmark
    note: "500k+ evaluations on Llama 3.1 (8B/70B/405B). W8A8-INT and W8A8-FP recover >99% (v1) / ~99% (v2) of baseline accuracy; W4A16-INT recovers ~99.9% HumanEval / 98.9% HumanEval+. Speedups ~1.8× (W8A8, multi-request server serving) and ~2.4× (W4A16, single-stream latency)."
  - id: vllm-quant
    title: "Quantization — Supported Hardware"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/latest/features/quantization/index.html"
    accessed: "2026-07-03"
    kind: docs
    note: "vLLM supports AWQ, GPTQ (INT4/W4A16), INT8 (W8A8), FP8 (W8A8), and more. FP8 (W8A8) requires Ada (SM 8.9)/Hopper (SM 9.0) or AMD; INT8 and GPTQ/AWQ run Turing→Hopper (and CPU)."
  - id: vllm-fp8kv
    title: "Quantized KV Cache (FP8)"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/latest/features/quantization/quantized_kvcache.html"
    accessed: "2026-07-03"
    kind: docs
    note: "FP8 KV-cache quantization reduces the KV memory footprint, letting more tokens fit in memory → improved throughput and longer context. Recommends llm-compressor with dataset calibration over random-token calibration."
  - id: hf-awq
    title: "AWQ — Transformers quantization docs"
    publisher: "Hugging Face"
    year: 2026
    url: "https://huggingface.co/docs/transformers/main/en/quantization/awq"
    accessed: "2026-07-03"
    kind: docs
    note: "4-bit AWQ (group_size 128). Benchmarked Mistral-7B-AWQ: fused kernels raise decode throughput from ~31–38 to ~80–106 tokens/s and cut VRAM (e.g. 4.50→4.00 GB at short context) vs unfused."
---

## Overview

When you serve a model behind an API you never see its weights — the provider absorbs
the hardware. When you **self-host**, the model's precision is a line item on your GPU
bill. A 70-billion-parameter model in FP16 is ~140 GB of weights and does not fit on a
single 80 GB GPU; you are forced onto two (or a bigger, scarcer card), and your throughput
is throttled by how fast those weights and the KV cache stream through memory.

**Calibrated quantization** shrinks that footprint by storing weights (and sometimes
activations and the KV cache) in **INT8, INT4, or FP8** instead of 16-bit floats. The word
that matters is *calibrated*: naive rounding to 4 bits wrecks quality, so these methods run
a small **calibration dataset** through the model to measure where precision actually
matters and protect it. The result is the *same* model on **half or a quarter** the memory,
running at **~1.8–2.4× the throughput**, with **>99% of the original accuracy** on the
right bit-width.[^redhat-eval] Fewer and cheaper GPUs at the same quality is a direct cut to
self-hosted **$/token**.

This is distinct from the serving-side, runtime KV-cache and activation tricks a serving
engine applies automatically — this page is about **producing a quantized model artifact**
you then deploy. It is squarely a **Level 4** technique because it *only* pays off once you
own the serving stack (pairs with *Local Model Deployment*), and because the hardest cases
require **quantization-aware training (QAT)** — retraining with quantization in the loop.
The honest split: **post-training AWQ/GPTQ/SmoothQuant is roughly L3 effort** (a calibration
run over an existing checkpoint); **QAT is the L4 piece**, reserved for when post-training
quantization has broken quality and you need to recover it.[^llm-qat]

## Detailed Approach & Techniques

### The methods (post-training, calibration-based)

- **GPTQ** — weight-only, one-shot post-training quantization to **3–4 bits** using
  approximate **second-order (Hessian) information** to decide how to round each weight so
  that the layer's output error is minimized. It quantizes a **175B** model in about **4
  GPU-hours** and fits it on a single GPU, reporting **~3.25× faster** inference on an A100
  and **~4.5×** on a cheaper A6000 versus FP16, with negligible accuracy
  degradation.[^gptq]
- **AWQ (Activation-aware Weight Quantization)** — the observation that only **~1% of weight
  channels are "salient,"** and that saliency is best read from **activation statistics**,
  not the weights themselves. AWQ applies an equivalent per-channel **scaling transform** to
  protect those channels, needs no backprop or reconstruction, and generalizes well across
  domains. It delivers **INT4** weight-only quantization with **>3× speedup** over the
  Hugging Face FP16 baseline, and (via its TinyChat runtime) runs a **70B Llama-2 on mobile
  GPUs**.[^awq] It won the **MLSys 2024 Best Paper** award and is a default for INT4 serving.
- **SmoothQuant** — the workhorse when you want to quantize **activations too** (W8A8 INT8,
  not just weights). Activations have hard-to-quantize outliers; SmoothQuant **offline
  migrates that difficulty from activations into the weights** via a smoothing factor, making
  both quantizable. Up to **1.56× speedup**, **2× memory reduction**, negligible accuracy
  loss, demonstrated up to a **530B** model on a single node.[^smoothquant]

These three are **post-training** (PTQ): you run a modest calibration set (a few hundred
samples) through the model once, and the calibration is where "calibrated" quantization
earns its name — the KV-cache/FP8 flows explicitly recommend **dataset-based calibration
over random-token calibration** for quality.[^vllm-fp8kv]

### The L4 piece: Quantization-Aware Training (QAT)

PTQ has a ceiling. As LLM-QAT documents, post-training methods "perform well down to 8-bits"
but **"break down at lower bit precision."**[^llm-qat] When you need **4-bit (or lower)
weights *and* activations *and* KV cache** at production quality, you move to **QAT** —
retraining the model with the quantization operation simulated in the forward pass so the
weights *learn* to be robust to rounding. **LLM-QAT** makes this practical with **data-free**
distillation (the model teaches itself from its own generations, so you don't need the
original training corpus), quantizing weights/activations/KV cache down to 4-bit with **large
improvements over training-free methods in the low-bit regime.**[^llm-qat] QAT costs training
compute and time — that's the L4 effort — so it's justified only when post-training AWQ/GPTQ
has visibly degraded quality and the volume justifies the extra work.

### The cost mechanism, quantified

The payoff is memory → hardware → throughput → $/token:

1. **Memory.** INT8 halves weight bytes vs FP16; INT4 quarters them. A 70B model drops from
   ~140 GB to ~70 GB (INT8) or ~35 GB (INT4), collapsing a 2-GPU deployment to one — or a
   large card to a smaller one. FP8 KV-cache quantization further shrinks the *per-token*
   memory, letting **more tokens fit in memory → higher throughput and longer
   context.**[^vllm-fp8kv]
2. **Throughput.** LLM decoding is memory-bandwidth-bound, so smaller weights stream faster.
   Red Hat/Neural Magic's **500k-evaluation** study measured **~1.8× speedup for 8-bit (W8A8)**
   in multi-request server serving and **~2.4× for 4-bit-weight (W4A16)** in single-stream
   latency.[^redhat-eval] Hugging Face's
   Mistral-7B AWQ benchmark shows decode throughput rising from **~31–38 to ~80–106
   tokens/s** with fused kernels, at **lower VRAM** (e.g. 4.50→4.00 GB).[^hf-awq]
3. **Accuracy retention (the tradeoff).** The same study is the strongest quality evidence:
   **W8A8-INT and W8A8-FP recover >99%** of baseline on OpenLLM v1 (~99% on the harder v2),
   and **W4A16-INT recovers ~99.9% on HumanEval / 98.9% on HumanEval+.**[^redhat-eval] Larger
   models tolerate quantization better than small ones — a general 7B is more fragile at INT4
   than a 70B.

### Hardware support

Bit-width choice is gated by your GPUs. Per vLLM's compatibility matrix: **FP8 (W8A8)
requires Ada (SM 8.9) or Hopper (SM 9.0)** NVIDIA GPUs (or AMD), because FP8 tensor cores
are new silicon; **INT8 (W8A8)** works Turing→Hopper (and CPU); **GPTQ/AWQ (INT4/W4A16)**
run Turing→Hopper.[^vllm-quant] So on H100/L40S-class hardware, FP8 is often the best
quality/throughput point; on older Ampere (A100) you reach for INT8 SmoothQuant or INT4
AWQ/GPTQ instead. All of these are one-flag loadable in vLLM or via `autoawq`/`llm-compressor`
toolchains.[^vllm-quant][^hf-awq]

## Example Where It Works

A company self-hosts a fine-tuned **70B** model for a high-volume internal document-analysis
task at steady, saturating load. In **FP16** the weights are ~140 GB, forcing **2× A100-80GB**
per replica, and decode is memory-bandwidth-limited.

They apply **INT4 AWQ** with a domain-representative calibration set. Weights drop to ~35 GB,
so each replica now fits on **one** A100 — **halving the GPU count** — and per the
500k-evaluation benchmark they can expect roughly **2.4× the single-request throughput** at
**~99% accuracy recovery** on their task.[^redhat-eval][^awq] Halving GPUs *and* raising
per-GPU throughput compounds into a large cut in **$/token**. On newer **H100/L40S** hardware
they'd instead pick **FP8 (W8A8)**, using the FP8 tensor cores their FP16 deployment left
idle, plus **FP8 KV-cache** quantization to pack more concurrent requests into
memory.[^vllm-quant][^vllm-fp8kv] If a first pass to INT4 nicks quality on a critical subtask,
**QAT** recovers it — the L4 escalation worth the retraining cost at this volume.[^llm-qat]

## Example Where It Would NOT Work

- **You're calling an API, not self-hosting.** Quantization changes *your* GPU footprint. If
  you consume Claude/GPT/Gemini through a provider, you have no weights to quantize — the
  lever is *Model Routing* or *Prompt Caching*, not this. This technique is only in scope for
  the self-hosted path (it pairs with *Local Model Deployment*).
- **Low or spiky volume.** The gain is fewer/cheaper GPUs at high utilization. If a single
  GPU already hosts your model with headroom, or traffic is bursty and GPUs sit idle, the
  calibration/QAT effort buys little — the money is being lost to idle capacity, not
  precision.
- **A small model pushed too far.** Aggressive **W4 activations** or 2-bit on a fragile **7B**
  model can drop quality below bar; PTQ "breaks down at lower bit precision,"[^llm-qat] and
  under-calibrated quantization degrades outputs. Without a task eval to confirm ≥99%
  recovery, you can silently ship a worse model. Here, staying at INT8/FP8 (or investing in
  QAT) beats a cheap-but-broken INT4.
- **Reaching for QAT when AWQ already suffices.** If post-training AWQ/GPTQ already holds
  quality (the common case at 8-bit and often 4-bit on large models), the QAT retraining is
  wasted L4 effort — stop at the L3-effort post-training pass.[^redhat-eval]

[^gptq]: Frantar, Ashkboos, Hoefler, Alistarh, "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers," ICLR 2023 — <https://arxiv.org/abs/2210.17323>
[^awq]: Lin, Tang, Tang, Yang, et al., "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration," MLSys 2024 — <https://arxiv.org/abs/2306.00978>
[^smoothquant]: Xiao, Lin, Seznec, Wu, Demouth, Han, "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models," ICML 2023 — <https://arxiv.org/abs/2211.10438>
[^llm-qat]: Liu, Oguz, Zhao, et al. (Meta), "LLM-QAT: Data-Free Quantization Aware Training for Large Language Models" — <https://arxiv.org/abs/2305.17888>
[^redhat-eval]: Red Hat / Neural Magic, "We ran over half a million evaluations on quantized LLMs — here's what we found," 2024 — <https://developers.redhat.com/articles/2024/10/17/we-ran-over-half-million-evaluations-quantized-llms>
[^vllm-quant]: vLLM Documentation, "Quantization — Supported Hardware" — <https://docs.vllm.ai/en/latest/features/quantization/index.html>
[^vllm-fp8kv]: vLLM Documentation, "Quantized KV Cache (FP8)" — <https://docs.vllm.ai/en/latest/features/quantization/quantized_kvcache.html>
[^hf-awq]: Hugging Face, "AWQ — Transformers quantization docs" — <https://huggingface.co/docs/transformers/main/en/quantization/awq>
