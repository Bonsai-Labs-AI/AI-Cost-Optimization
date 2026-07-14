---
title: "Learned Prompt Compression (LLMLingua)"
category: prompt-context
maturityLevel: 3
maturityProvisional: false
shortDescription: "Use a trained compressor model (LLMLingua family) to drop low-information tokens from long context before the main model, cutting input tokens on verbose prompts while preserving task performance."
effort: Medium
gain: Medium
riskToQuality: Medium
detectionSignals:
  - "Long, redundant context is sent verbatim on every call — large RAG chunk sets, big few-shot blocks, pasted documents or transcripts."
  - "Input-token cost dominates the bill and the input is prose-heavy (summaries, articles, meeting notes) rather than terse instructions."
  - "The same verbose context is re-sent per request but with different per-request keys, so it cannot be prefix-cached."
  - "Context is padded 'to be safe' well beyond what the answer actually needs."
measurementMethods:
  - "Compression ratio (original tokens ÷ compressed tokens), tracked per request class."
  - "Input tokens per call before vs. after compression, and blended input $/request."
  - "Task quality at a fixed bar (accuracy / F1 / eval score) on compressed vs. uncompressed context."
  - "Compressor overhead: added latency per call and the compressor's own inference cost (GPU-seconds or hosted price) as a share of the tokens saved."
status: published
lastUpdated: "2026-07-03"
related:
  - "prompt-context/few-shot-example-pruning"
  - "prompt-context/context-window-budgeting"
  - "prompt-context/structured-context-packing"
  - "prompt-context/dynamic-few-shot-selection"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: llmlingua-paper
    title: "LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models"
    publisher: "EMNLP 2023 (arXiv:2310.05736)"
    authors: "Jiang, Wu, Lin, Yang, Qiu (Microsoft)"
    year: 2023
    url: "https://arxiv.org/abs/2310.05736"
    accessed: "2026-07-03"
    kind: paper
    note: "Coarse-to-fine method: a budget controller plus token-level iterative compression using a small LM (GPT2-small / LLaMA-7B) to score token informativeness. Claims up to 20x compression with little performance loss on GSM8K, BBH, ShareGPT, Arxiv-March23."
  - id: llmlingua2-paper
    title: "LLMLingua-2: Data Distillation for Efficient and Faithful Task-Agnostic Prompt Compression"
    publisher: "Findings of ACL 2024 (arXiv:2403.12968)"
    authors: "Pan, Wu, Jiang, et al. (Microsoft)"
    year: 2024
    url: "https://arxiv.org/abs/2403.12968"
    accessed: "2026-07-03"
    kind: paper
    note: "Reframes compression as token classification with a bidirectional Transformer encoder (XLM-RoBERTa), trained by distilling GPT-4 compression labels. 3x-6x faster than LLMLingua, end-to-end 1.6x-2.9x latency speedup at 2x-5x compression ratios."
  - id: longllmlingua-paper
    title: "LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression"
    publisher: "ACL 2024 (arXiv:2310.06839)"
    authors: "Jiang, Wu, et al. (Microsoft)"
    year: 2024
    url: "https://arxiv.org/abs/2310.06839"
    accessed: "2026-07-03"
    kind: paper
    note: "Question-aware, document-level compression + reordering for long context. Up to 21.4% performance gain with ~4x fewer tokens on NaturalQuestions (GPT-3.5-Turbo); up to 94% cost reduction on LooGLE; 1.4x-2.6x end-to-end speedup at 2x-6x compression on ~10k-token prompts."
  - id: llmlingua-repo
    title: "microsoft/LLMLingua"
    publisher: "GitHub (Microsoft)"
    year: 2026
    url: "https://github.com/microsoft/LLMLingua"
    accessed: "2026-07-03"
    kind: repo
    note: "Reference implementation. `pip install llmlingua`; PromptCompressor.compress_prompt(..., target_token=N). Compressor models: GPT2-small / LLaMA-7B (LLMLingua) or a BERT-level XLM-RoBERTa encoder (LLMLingua-2)."
  - id: llmlingua-blog
    title: "LLMLingua: Innovating LLM efficiency with prompt compression"
    publisher: "Microsoft Research Blog"
    year: 2023
    url: "https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/"
    accessed: "2026-07-03"
    kind: blog
    note: "A well-trained small LM (GPT2-small/LLaMA-7B) identifies and removes unimportant tokens; token-level compressed prompts are hard for humans to read but effective for LLMs. Headline 20x figure."
  - id: char-compression-eval
    title: "Characterizing Prompt Compression Methods for Long Context Inference"
    publisher: "arXiv:2407.08892"
    authors: "Jha, et al."
    year: 2024
    url: "https://arxiv.org/html/2407.08892v1"
    accessed: "2026-07-03"
    kind: benchmark
    note: "Independent eval. Extractive compression enables up to ~10x compression with minimal accuracy loss; LongLLMLingua-style token pruning 'typically exhibit the worst behavior across datasets' and degrades under aggressive (e.g. 50%) pruning as text loses grammatical structure."
---

## Overview

Long prompts are expensive because you pay input price for **every token** you send, on
**every call**. A large share of that input is often low-information filler: boilerplate in
retrieved RAG chunks, verbose few-shot examples, repeated framing, hedging prose in pasted
documents and transcripts. A human skim would keep maybe half of it; the model would still
answer correctly on the trimmed version.

**Learned prompt compression** automates that trimming. Instead of hand-editing prompts, a
small trained *compressor* model reads the context and drops the tokens it judges least
informative, subject to a token budget you set — producing a shorter prompt that the main
(expensive) model still answers well on. The canonical family is Microsoft's **LLMLingua**,
**LLMLingua-2**, and **LongLLMLingua**.[^llmlingua-paper][^llmlingua2-paper][^longllmlingua-paper]

The headline number attached to LLMLingua is "**up to 20×** compression."[^llmlingua-blog]
Treat that as a ceiling on cherry-picked tasks, not a planning figure. Independent evaluation
and the follow-up papers put the **realistic band at roughly 2–10×** before quality starts to
slip on most tasks — extractive compression "enables up to 10× compression with minimal
accuracy degradation," and LLMLingua-2's own reported operating range is **2×–5×**.[^char-compression-eval][^llmlingua2-paper]
This lands at **Level 3** because doing it well is real engineering: you run and tune an extra
model in the request path, hold quality with an eval harness, and accept that compressed
prompts **break prefix caching** (covered below). It pays on **verbose, input-token-dominated
workloads**; it is a poor fit for already-terse prompts and exact-token tasks.

## Detailed Approach & Techniques

### How LLMLingua scores and drops tokens

The original LLMLingua is a **coarse-to-fine** pipeline with two ideas that matter:[^llmlingua-paper]

1. **A budget controller** allocates a compression ratio across the prompt's components
   (instruction, demonstrations, question) so high-value parts are compressed less
   aggressively — you set a target and it distributes the cuts.
2. **Token-level iterative compression.** A **small, well-trained language model** — GPT2-small
   or LLaMA-7B — scores each token by how *informative/surprising* it is (perplexity-style
   scoring under that small LM), and the low-information tokens are removed iteratively so the
   method accounts for interdependence between remaining tokens.[^llmlingua-paper][^llmlingua-blog]

The compressed prompt is often **not human-readable** — it looks like clipped shorthand — but
the target LLM still recovers the task, which is the whole trick.[^llmlingua-blog]

### LLMLingua-2 — faster, task-agnostic, encoder-based

LLMLingua-2 reframes compression as **token classification**: a bidirectional Transformer
encoder (an XLM-RoBERTa model) labels each token keep/drop, trained by **distilling GPT-4's
compression decisions** into the small encoder.[^llmlingua2-paper][^llmlingua-repo] Because it
reads the full context bidirectionally (not left-to-right perplexity), it is more faithful and
**3×–6× faster than the original LLMLingua**, giving **1.6×–2.9× end-to-end latency speedup at
2×–5× compression**.[^llmlingua2-paper] For most production use, LLMLingua-2 is the practical
default: cheaper compressor, task-agnostic, tighter latency.

### LongLLMLingua — question-aware, for long RAG context

LongLLMLingua adds **question-aware** compression and **document reordering** for long-context
RAG: it scores documents by perplexity *conditioned on the question* and compresses/reorders so
the answer-bearing content survives and sits where the model attends best. Reported gains: **up
to 21.4% higher accuracy with ~4× fewer tokens** on NaturalQuestions (GPT-3.5-Turbo), up to
**94% cost reduction** on LooGLE, and **1.4×–2.6× speedup at 2×–6×** compression on ~10k-token
prompts.[^longllmlingua-paper] Caveat: an independent characterization found LongLLMLingua-style
token pruning **"typically exhibit[s] the worst behavior across datasets"** versus reranker-based
*extractive* compression, and degrades once pruning gets aggressive because the residual text
"does not respect grammatical constructs."[^char-compression-eval] So validate against your own
data rather than trusting the paper's best case.

### Implementation

Use the reference library: `pip install llmlingua`, then call
`PromptCompressor.compress_prompt(context, instruction=..., question=..., target_token=N)` — you
give a token budget and it returns the compressed prompt.[^llmlingua-repo] Apply it to the
**verbose, reusable-but-not-cacheable** parts (retrieved chunks, long documents), not to your
short authored instruction.

### The two costs that decide ROI

- **The compressor's own inference.** You now run an extra model (a 7B LM, or the lighter
  XLM-RoBERTa encoder) on every request. Its cost + added latency must stay well below the input
  tokens it saves. The small encoder in LLMLingua-2 exists precisely to shrink this
  overhead.[^llmlingua2-paper] Below high volume or on already-short prompts, this overhead can
  erase the savings.
- **Compression breaks prefix caching.** A compressed prompt is **dynamic per input** — the
  surviving tokens differ every request — so it does **not** produce a stable, reusable prefix.
  Prefix/prompt caching, which bills a repeated prefix at ~10–50% (see *Prompt Caching /
  Prefix Caching*), needs byte-identical prefixes and is defeated by per-input compression. On
  workloads where the *same* long context repeats across calls, **caching usually beats
  compression**; compression wins when the context is long, verbose, and **different every time**.

## Example Where It Works

A RAG assistant over a large internal knowledge base retrieves **top-8 chunks (~6,000 tokens of
prose)** per query and pastes them verbatim into a frontier model, serving a high, steady query
volume. The chunks are boilerplate-heavy (headers, disclaimers, repeated context) and — because
each query retrieves a *different* set — they **can't be prefix-cached**.

Running LongLLMLingua/LLMLingua-2 question-aware compression at a **~4×** ratio cuts the retrieved
context from ~6,000 to ~1,500 input tokens per call while holding answer accuracy at the eval
bar — in line with the papers' "~4× fewer tokens with maintained or improved accuracy" on
retrieval QA.[^longllmlingua-paper][^char-compression-eval] Because input tokens dominate the
bill and there was no cache to lose, the net saving is large even after paying for the lightweight
encoder compressor. This is the sweet spot: **long, redundant, per-request-unique context**.

## Example Where It Would NOT Work

- **Already-terse prompts.** A classification call with a 200-token instruction and a short input
  has almost no low-information filler to remove; a 2× target would mostly strip signal, and the
  compressor's latency + cost would exceed anything saved. Compression needs verbosity to feed on.
- **Exact-token tasks — code, legal, math, structured data.** LLMLingua produces non-human-readable,
  grammatically-broken residual text.[^llmlingua-blog][^char-compression-eval] Dropping "unimportant"
  tokens from source code, a contract clause, a SQL query, or a numeric table can silently change
  meaning. These tasks need every token; use *few-shot pruning* or *context budgeting* instead.
- **Repeated, cacheable context.** If the *same* long system prompt / document is sent across many
  calls, **prefix caching** already discounts it ~90% (Anthropic/Gemini) with zero quality risk —
  and compression would *destroy* that cache by making the prefix dynamic. Cache first; only reach
  for compression on context that is long **and** different every request.
- **Over-aggressive ratios.** Pushing past ~10× (chasing the 20× headline) reliably degrades
  quality — the independent eval saw token-pruning methods fall apart under aggressive
  compression.[^char-compression-eval] Without an eval harness gating the ratio, you ship silent
  quality regressions.

[^llmlingua-paper]: Jiang et al., "LLMLingua: Compressing Prompts for Accelerated Inference of LLMs," EMNLP 2023 — <https://arxiv.org/abs/2310.05736>
[^llmlingua2-paper]: Pan et al., "LLMLingua-2: Data Distillation for Efficient and Faithful Task-Agnostic Prompt Compression," Findings of ACL 2024 — <https://arxiv.org/abs/2403.12968>
[^longllmlingua-paper]: Jiang et al., "LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression," ACL 2024 — <https://arxiv.org/abs/2310.06839>
[^llmlingua-repo]: Microsoft, "microsoft/LLMLingua," GitHub — <https://github.com/microsoft/LLMLingua>
[^llmlingua-blog]: Microsoft Research, "LLMLingua: Innovating LLM efficiency with prompt compression" — <https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/>
[^char-compression-eval]: Jha et al., "Characterizing Prompt Compression Methods for Long Context Inference," arXiv:2407.08892 — <https://arxiv.org/html/2407.08892v1>
