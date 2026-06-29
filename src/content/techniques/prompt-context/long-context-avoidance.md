---
title: "Long-Context Avoidance"
category: prompt-context
maturityLevel: 1
maturityProvisional: false
shortDescription: "Stop stuffing whole documents and full chat history into the window — retrieve, chunk, and summarize so each call carries only the tokens it needs, cutting input cost and usually improving quality."
effort: Medium
gain: High
riskToQuality: Low
effortWhy: Medium because it requires standing up retrieval, chunking, and summarization or history management rather than just editing a fixed prompt.
gainWhy: High because input is billed per token, so a prompt carrying only the passages it needs can cut input by ~98% on context-heavy calls.
riskWhy: Low because trimming usually holds or improves quality — models degrade as context grows — provided trimming is tuned against an eval set.
detectionSignals:
  - "Whole-document dumps — entire files or knowledge-base pages are pasted in 'just in case,' regardless of the question."
  - "Full history resent — the entire conversation is re-sent verbatim every turn instead of a running summary plus the last few messages."
  - "Near the context limit — prompts routinely run close to the model's window, or average input tokens per call are tens of thousands."
  - "Low context utilization — input tokens dominate the bill while only a small fraction of the supplied context is referenced in the answer."
measurementMethods:
  - "Input tokens per call — tracked before vs. after trimming the context to what is actually needed."
  - "Answer quality — eval-set accuracy or human rating of a retrieval-bounded prompt vs. the full-dump baseline, expected to hold or improve."
  - "Context utilization — tokens cited or referenced in the answer ÷ tokens sent, exposing how much supplied context is used."
  - "Cost and latency — cost per request and time-to-first-token, both of which fall as the prompt shrinks."
status: published
lastUpdated: "2026-06-29"
related:
  - "rag/reducing-retrieved-chunk-count"
  - "prompt-context/context-offloading"
  - "prompt-context/learned-prompt-compression"
sources:
  - id: lost-in-middle
    title: "Lost in the Middle: How Language Models Use Long Contexts"
    publisher: "Transactions of the ACL (TACL)"
    authors: "Liu, Lin, Hewitt, Paranjape, Bevilacqua, Petroni, Liang"
    year: 2023
    url: "https://arxiv.org/abs/2307.03172"
    accessed: "2026-06-29"
    kind: paper
    note: "U-shaped performance curve: accuracy is highest when the relevant fact is at the very start or end of the context and degrades significantly when it sits in the middle."
  - id: nolima
    title: "NoLiMa: Long-Context Evaluation Beyond Literal Matching"
    publisher: "ICML 2025"
    authors: "Modarressi, Deilamsalehy, Dernoncourt, Bui, Rossi, Yoon, Schütze"
    year: 2025
    url: "https://arxiv.org/abs/2502.05167"
    accessed: "2026-06-29"
    kind: paper
    note: "Across 13 models claiming 128K+ context, performance falls sharply with length: at 32K, 11 of 13 drop below 50% of their short-context baseline; GPT-4o falls from 99.3% to 69.7%. Long windows do not equal usable long context."
  - id: length-hurts
    title: "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval"
    publisher: "arXiv"
    authors: "Du, Tian, Ronanki, Rongali, Bodapati, Galstyan, Wells, Schwartz, Huerta, Peng"
    year: 2025
    url: "https://arxiv.org/abs/2510.05381"
    accessed: "2026-06-29"
    kind: paper
    note: "Even with perfect retrieval and evidence placed right before the question, performance degrades 13.9–85% as input length grows — sheer length hurts independent of retrieval quality or distractors."
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-06-29"
    kind: blog
    note: "Names 'context rot' (recall drops as tokens grow) and frames context as a finite 'attention budget.' Advocates 'just-in-time' retrieval: keep lightweight identifiers (file paths, queries, links) and load data on demand; find 'the smallest possible set of high-signal tokens.'"
  - id: self-route
    title: "Retrieval Augmented Generation or Long-Context LLMs? A Comprehensive Study and Hybrid Approach"
    publisher: "EMNLP 2024 (Industry Track)"
    authors: "Li, Li, Zhang, Mei, Bendersky (Google)"
    year: 2024
    url: "https://arxiv.org/abs/2407.16833"
    accessed: "2026-06-29"
    kind: paper
    note: "Long context outperforms RAG when fully resourced, but RAG is far cheaper. Self-Route routes each query to RAG or long context by self-reflection, cutting cost while matching long-context quality — the canonical 'hybrid' result."
  - id: anthropic-pricing
    title: "Pricing (per-token rates; long-context billing)"
    publisher: "Anthropic — Claude Platform Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-06-29"
    kind: pricing
    note: "Input is billed per token and output is billed ~5× input across the model line; long context is charged at the standard per-token rate (a 900k-token request costs the same per token as a 9k one), so more context equals proportionally more cost. A tokenizer change can also use up to 35% more tokens for the same text."
---

## Overview

The cheapest token is the one you never send. Every LLM request re-processes its **entire
input** before producing a single output token, and input is billed strictly per token — a
prompt with 50,000 tokens of pasted context costs roughly fifty times the input of a
1,000-token prompt, because long context is charged at the same per-token rate as short
context.[^anthropic-pricing] **Long-context avoidance** is the discipline of *not* dumping
whole documents, entire knowledge bases, or full conversation history into the window on the
chance it might be relevant — and instead retrieving, chunking, and summarizing so each call
carries only the high-signal tokens the task actually needs.

The cost problem is that "just paste it all in" is the default a team reaches for first, and
it is silently expensive: input tokens balloon, the bill scales with how much context you
*could* attach rather than how much the answer *uses*, and the waste compounds on every call
of a high-traffic feature. The counter-intuitive part — and the reason this sits at **Level 1**
rather than being a pure cost trade-off — is that trimming the context usually **improves
quality too**. Models do not use a long context uniformly: accuracy is highest for facts at
the very beginning or end of the input and degrades for anything in the middle (the
"lost-in-the-middle" U-curve), and this holds even at the 128K+ windows that are standard in
2026.[^lost-in-middle][^nolima] More starkly, sheer input length hurts *independent of
retrieval* — even with the right evidence placed immediately before the question, performance
degrades as the surrounding context grows.[^length-hurts] So padding the window with "context
just in case" both costs more and dilutes the answer. Avoiding it is one of the rare levers
where the cheap option is also the better one.

## Detailed Approach & Techniques

### Send the smallest high-signal set, not the whole corpus

Anthropic's framing of *context engineering* is the operating principle: treat context as a
finite resource with diminishing returns — an **attention budget** — and aim for "the smallest
possible set of high-signal tokens that maximize the likelihood of the desired
outcome."[^anthropic-context-eng] Concretely, that means replacing each "dump" pattern with a
"select" pattern:

- **Documents → retrieved chunks.** Instead of pasting a full PDF or wiki page, index it and
  retrieve only the passages relevant to the query (the RAG pattern). The companion lever is to
  keep `top_k` small — retrieved context typically dwarfs the question in token count, so cutting
  the number of chunks passed to generation is the single highest-ROI knob (see *Reducing
  Retrieved Chunk Count*).
- **Full history → running summary + recent turns.** In multi-turn chat and agents, don't re-send
  the entire transcript every step. Keep the last few messages verbatim and a compact rolling
  summary of everything older, or offload older state out of the window entirely (see *Context
  Offloading*).
- **Long static blobs → compressed essence.** Where a long reference must be present, a learned or
  prompted compression pass can shrink it before it ever enters the prompt (see *Learned Prompt
  Compression*).

### Just-in-time retrieval via lightweight identifiers

The 2026 expression of this technique is **just-in-time (load-on-demand) retrieval**. Rather
than pre-loading everything an agent *might* need, you keep **lightweight identifiers** — file
paths, stored queries, URLs, record IDs — in the context, and let the model pull the actual data
into the window at runtime through tools only when a step requires it.[^anthropic-context-eng]
This mirrors how people work: we don't memorize whole corpuses, we keep an index (a file system,
an inbox, bookmarks) and fetch on demand. The payoff is twofold — the window stays small and
focused (lower cost, less "context rot"), and the agent reads file sizes, names, and timestamps
as it goes, gathering only what each decision needs.[^anthropic-context-eng] A coding agent that
`grep`s for a symbol and reads two files beats one that was handed the entire repository up front,
on both bill and accuracy.

### Measure what the answer actually uses

Make the waste visible. Two diagnostics expose over-stuffing cheaply: **average input tokens per
call** (is it drifting toward the window limit?) and the **share of supplied context that the
answer references** (if you attach 20 chunks and the answer cites two, you are paying for
eighteen). Pair any trimming change with a quality eval so you can confirm the cheaper prompt
holds or beats the baseline — which, given the length-degradation findings, it frequently does.

### When long context *is* the right call — the honest counter-case

This is not "always use RAG." The RAG-versus-long-context debate has a real answer: when fully
resourced, **long context tends to outperform RAG on quality** — it avoids retrieval misses and
keeps cross-document reasoning intact — but RAG is dramatically cheaper.[^self-route] The mature
2026 consensus is **hybrid**: don't choose globally, route per query. The Self-Route approach lets
the model self-assess whether the retrieved evidence is sufficient and escalate to a long-context
pass only when it isn't, capturing most of the quality at a fraction of the cost.[^self-route] The
pragmatic rule of thumb: **run long context over a *retrieval-bounded* evidence set** — use
retrieval to shrink the candidate material to what's plausibly relevant, then let the model reason
over that bounded set, rather than over the entire corpus or nothing at all. Tasks that genuinely
need global reasoning over one cohesive document (summarize this contract, reconcile this whole
codebase change) are where you deliberately *spend* the tokens — and where prompt caching, not
avoidance, becomes the cost lever.

## Example Where It Works

A support assistant answers questions against a 400-page product manual. The naive build pastes
the **entire manual** (~120,000 tokens) into every request "so the model has everything." At a
few dollars per million input tokens and tens of thousands of questions a day, that is the
dominant line on the bill — and answers are mediocre, because the relevant paragraph is usually
buried in the middle of a huge context where recall is weakest.[^lost-in-middle][^length-hurts]

Switching to retrieval — index the manual, fetch the ~5 passages relevant to each question, and
pass only those (~2,500 tokens) — cuts input tokens for that step by **~98%**, and the per-token
rate is unchanged, so cost falls almost in proportion.[^anthropic-pricing] Time-to-first-token
drops because there is far less to prefill. And answer quality typically *rises*, because the model
now sees a short, on-topic context instead of a 120k-token haystack.[^nolima] The team gets a
cheaper *and* better feature from the same model — the textbook outcome for this technique.

## Example Where It Would NOT Work

- **Genuinely global reasoning over one document.** "Summarize this 80-page deposition" or "find
  every inconsistency across this whole filing" needs the model to attend to the *entire* text at
  once; chunked retrieval would miss cross-references and produce a worse answer. Here the right
  move is to spend the tokens deliberately and attack cost with *prompt caching* and a right-sized
  model — not avoidance.
- **Retrieval is unreliable or the corpus is tiny.** If your retriever has poor recall, aggressively
  trimming context trades a cost win for missed-evidence errors; you may be better off passing more
  context (or improving retrieval first). And if the whole reference is only a few thousand tokens,
  the engineering to retrieve/summarize it isn't worth it — just include it.
- **Caching already neutralizes the cost.** When the same large block is reused across many requests
  (a stable shared document or system context), prompt caching can bill the repeated portion at a
  steep discount, so the marginal cost of keeping it in-window is small. Avoidance still helps
  *quality* via shorter effective context, but the cost argument weakens — evaluate the
  quality/latency trade rather than assuming trimming pays.
- **Over-aggressive trimming that drops needed evidence.** Cutting `top_k` too far or summarizing
  away a load-bearing detail degrades multi-fact and long-tail answers. Tune the budget against an
  eval set; the goal is the *smallest sufficient* context, not the smallest possible one.

[^lost-in-middle]: Liu et al., "Lost in the Middle: How Language Models Use Long Contexts," TACL 2023 — <https://arxiv.org/abs/2307.03172>
[^nolima]: Modarressi et al., "NoLiMa: Long-Context Evaluation Beyond Literal Matching," ICML 2025 — <https://arxiv.org/abs/2502.05167>
[^length-hurts]: Du et al., "Context Length Alone Hurts LLM Performance Despite Perfect Retrieval," 2025 — <https://arxiv.org/abs/2510.05381>
[^anthropic-context-eng]: Anthropic, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^self-route]: Li et al., "Retrieval Augmented Generation or Long-Context LLMs? A Comprehensive Study and Hybrid Approach," EMNLP 2024 (Industry) — <https://arxiv.org/abs/2407.16833>
[^anthropic-pricing]: Anthropic, "Pricing," Claude Platform Docs — <https://platform.claude.com/docs/en/about-claude/pricing>
