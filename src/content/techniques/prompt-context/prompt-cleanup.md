---
title: "Prompt Cleanup"
category: prompt-context
maturityLevel: 0
maturityProvisional: false
shortDescription: "Strip accreted boilerplate, dead instructions, redundant restatements, stale few-shot examples, and unused tool descriptions from your prompts — including the system prompt — so you stop paying full input price for tokens that add no signal."
effort: Low
gain: Medium
riskToQuality: Low
effortWhy: "L0 hygiene with no infrastructure — just read the prompts you already send and delete the no-signal tokens."
gainWhy: Medium because cleanup removes obvious waste cheaply but is not a structural win like model right-sizing or batching.
riskWhy: Low because each pass is gated on an unchanged held-out eval score, so removed tokens are proven to be waste.
detectionSignals:
  - "Accreted system prompt — instructions were added to patch incidents and never removed or consolidated."
  - "Restated rules — the same constraint appears two or three times in different wording across the prompt."
  - "Stale few-shot examples — added early and never revisited; some are now redundant or contradict newer instructions."
  - "Tool-schema overload — every tool/function schema is injected on every call regardless of whether the request could use it."
  - "High fixed input — input tokens dominate the bill and the per-call count is high and stable even on trivial requests."
measurementMethods:
  - "Input tokens per call — before vs. after cleanup, plus the system-prompt token count in isolation."
  - "Held-out eval score — run before and after to confirm it is unchanged, so no quality regression came from what you removed."
  - "Prefix-cache hit rate — should hold or improve once the static block is tightened and stabilized."
  - "Cost per request — tracked on the affected endpoints over the course of the cleanup."
status: published
lastUpdated: "2026-06-29"
related:
  - "prompt-context/prompt-modularization"
  - "prompt-context/long-context-avoidance"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: anthropic-ce
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-06-29"
    kind: blog
    note: "Context engineering = 'find the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome.' LLMs have a finite 'attention budget'; aim for the minimal set of information that fully outlines expected behavior; avoid bloated tool sets and over-specified, brittle prompts; target the 'right altitude.' Published 2025-09-29."
  - id: openai-pe
    title: "Best practices for prompt engineering with the OpenAI API"
    publisher: "OpenAI Help Center"
    year: 2026
    url: "https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api"
    accessed: "2026-06-29"
    kind: docs
    note: "Advises being specific and concise and to 'Reduce \"fluffy\" and imprecise descriptions' — e.g. replace 'fairly short, a few sentences only' with 'Use a 3 to 5 sentence paragraph.'"
  - id: chroma-rot
    title: "Context Rot: How Increasing Input Tokens Impacts LLM Performance"
    publisher: "Chroma Research (Hong, Troynikov, Huber)"
    year: 2025
    url: "https://research.trychroma.com/context-rot"
    accessed: "2026-06-29"
    kind: benchmark
    note: "Tested 18 frontier models (incl. GPT-4.1, Claude 4, Gemini 2.5, Qwen3); performance degrades non-uniformly as input length grows, well before the window limit. Removing low-signal tokens is a quality lever, not only a cost one. Published July 2025."
  - id: redis-bloat
    title: "Prompt bloat: causes, costs & fixes for LLM apps"
    publisher: "Redis Blog"
    authors: "Jim Allen Wallace"
    year: 2026
    url: "https://redis.io/blog/prompt-bloat-llm-apps/"
    accessed: "2026-06-29"
    kind: blog
    note: "Catalogs production bloat root causes: overlong system prompts (over-specification and compensatory elaboration), unfiltered conversation history, raw RAG dumps, and tool-definition overload (full schemas of every tool injected each call). System prompts are 'consumed in full on every inference call' and are often the highest fixed-cost component."
  - id: inventivehq
    title: "Optimizing Prompts to Reduce Token Usage and Costs"
    publisher: "InventiveHQ"
    year: 2025
    url: "https://inventivehq.com/blog/optimize-prompts-reduce-token-costs"
    accessed: "2026-06-29"
    kind: blog
    note: "Practitioner before/after figures: a verbose system prompt cut 312 → 47 tokens; a customer-service prompt 847 → 156 tokens. Reports well-optimized prompts typically reduce token usage 40–70% vs naive implementations. Secondary source — illustrative, not authoritative."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-06-29"
    kind: docs
    note: "Caching applies to a contiguous, byte-identical prefix; a stable, clean static block is what a cache reuses. A clean prompt is a precondition for a high cache-hit rate."
---

## Overview

Prompt cleanup is the most basic prompt-cost hygiene there is: go through the prompts your
app actually sends and **remove the tokens that carry no signal**. In production these
accumulate silently — a system prompt grows by accretion as engineers paste in a new rule
to patch each incident and never delete the old one; the same constraint gets restated two
or three times in slightly different words; few-shot examples added on day one are never
revisited and now overlap or contradict newer instructions; and every tool schema is
injected on every call whether or not the request could use it.[^redis-bloat]

The cost problem is mechanical. The system prompt and tool definitions are **consumed in
full on every inference call** and are often the single highest fixed-cost component of an
LLM application, so every redundant sentence is re-billed at full input price on every
request, forever.[^redis-bloat] At any real call volume that waste compounds. This page
**absorbs system-prompt minimization** — the system prompt is usually the biggest target,
but the same discipline applies to tool descriptions, few-shot blocks, retrieved context,
and instruction scaffolding anywhere in the request.

The 2026 framing for this is Anthropic's **context engineering**: the goal is to "find the
*smallest possible* set of high-signal tokens that maximize the likelihood of some desired
outcome," because models draw on a finite **attention budget** when parsing context.[^anthropic-ce]
Cleanup is the L0, manual front edge of that idea — no infrastructure, just deletion.

We score the gain **Medium** and want to be honest about it: cleanup is hygiene, not a
structural win. It will not 10× your bill the way model right-sizing or batch processing
can. What it does is remove obvious waste cheaply and with essentially no quality risk —
and, increasingly, it can *improve* quality, since shorter high-signal prompts dodge
"context rot," the measured degradation models suffer as low-value tokens pile up.[^chroma-rot]

## Detailed Approach & Techniques

### What to look for

The recurring sources of prompt bloat are well catalogued:[^redis-bloat]

- **Overlong system prompts.** Two failure modes drive these: *over-specification* (brittle,
  hardcoded logic that bloats the prompt) and *compensatory elaboration* (engineers patching
  underperformance by piling on more text). Both add tokens without adding signal.
- **Redundant restatement.** The same rule expressed multiple times, or instructions that
  duplicate what an example already demonstrates.
- **Stale few-shot examples.** Demonstrations added early, never pruned — now overlapping,
  outdated, or in tension with later instructions. Examples are expensive (they are often the
  largest block) so dead ones are costly dead weight.
- **Tool-definition overload.** Agents that inject the full name + description + JSON schema
  of *every* connected tool on every call, including the ones a given request can never
  touch. With several MCP servers attached this can be thousands of tokens before any real
  work begins.[^redis-bloat]
- **Leftover scaffolding.** Verbose preambles, polite filler ("please carefully…"), and
  imprecise "fluffy" descriptions that providers themselves recommend tightening — e.g.
  replacing "fairly short, a few sentences only" with "Use a 3 to 5 sentence paragraph."[^openai-pe]

### How to do it safely

1. **Measure the baseline.** Count the system-prompt tokens in isolation and the average
   input tokens per call. You cannot claim a win you did not measure.
2. **Aim for the minimal high-signal set.** Anthropic's guidance is to provide "the minimal
   set of information that fully outlines your expected behavior" and to hit the **right
   altitude** — specific enough to steer the model, but not so prescriptive that you hardcode
   brittle logic.[^anthropic-ce] Delete the rest.
3. **Tighten wording.** Be specific and concise; cut fluffy, imprecise language and collapse
   restated rules into one.[^openai-pe]
4. **Prune examples and tools to what earns its place.** Keep the few-shot examples that
   demonstrate something the instructions cannot, and scope tool schemas to the request
   (inject only the relevant tools rather than the full catalog).[^redis-bloat]
5. **Verify no quality loss.** Re-run a held-out eval set after each pass. If the score
   holds, the tokens you removed were genuinely waste; if it drops, you cut signal and should
   restore the offending piece. This eval-gated loop is what keeps the risk **Low**.

### How it relates to its neighbours

- **Distinct from prompt modularization — remove vs. reuse.** Cleanup *deletes* waste;
  modularization *organizes* prompts into reusable, independently-editable blocks. They are
  complementary: clean first, then modularize what remains.
- **Pairs with prompt caching.** Caching only reuses a **contiguous, byte-identical
  prefix**, so a smaller, stabilized static block both costs less to write into the cache and
  is easier to keep identical across calls — a clean static block caches better.[^anthropic-pc]
  Cleanup is a precondition that lifts the payoff of the (much larger) caching lever.
- **A quality lever too, not only cost.** Because every frontier model tested degrades as
  input length grows — often well before the context-window limit — removing low-signal
  tokens can raise answer quality, not just lower the bill.[^chroma-rot]

## Example Where It Works

A B2B support assistant has a system prompt that has grown over a year to **~3,400 tokens**:
the original instructions, plus a dozen "always remember to…" clauses added to fix specific
escalations, three restatements of the refund policy in different wording, and 14 few-shot
examples (several now redundant). It handles 80,000 messages/day, and the static block is
re-billed on every one.

A half-day cleanup, eval-gated against a 200-case regression set:

- Consolidate the duplicated policy statements into one; delete six obsolete "remember to…"
  clauses superseded by newer rules; prune the few-shot set from 14 to 5 high-signal
  examples; tighten fluffy phrasing.[^openai-pe][^redis-bloat]
- Result: system prompt drops from **~3,400 → ~1,300 tokens** with the eval score unchanged.
  That is ~2,100 fewer input tokens **on every one of 80,000 daily calls**, a large standing
  reduction in input spend for a few hours of work — the kind of 40–70% prompt-size cut
  practitioners routinely report.[^inventivehq]
- Bonus: the now-stable, smaller static block becomes an ideal prompt-caching prefix, so the
  remaining input cost can be cut a further ~90% on a cache hit.[^anthropic-pc]

## Example Where It Would NOT Work

- **The prompt is already lean.** If a team built prompts carefully and audits them, there is
  little to delete; cleanup yields a rounding-error saving and the engineering hour is better
  spent on a structural lever (model right-sizing, batching, caching).
- **The cost is in the output, not the input.** A long-form drafting feature whose spend is
  dominated by generated output tokens gains almost nothing from trimming the prompt —
  output-side techniques are the right target there.
- **The cost is in dynamic context, not the static prompt.** When the bill is driven by large
  *per-request* payloads — whole documents pasted in, full chat history resent each turn, or
  raw top-k RAG dumps — the win lives in retrieval and history management, not in editing the
  fixed prompt. That is *Long-Context Avoidance* and RAG hygiene, not cleanup.[^redis-bloat]
- **Cutting past the signal.** Over-aggressive deletion that removes a constraint or example
  the model actually relied on degrades quality and triggers retries or escalations — which
  can cost *more* than the tokens saved. This is exactly why every pass must be gated on an
  unchanged eval score rather than on token count alone.[^chroma-rot]

[^anthropic-ce]: Anthropic, "Effective context engineering for AI agents," Engineering Blog (2025) — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^openai-pe]: OpenAI Help Center, "Best practices for prompt engineering with the OpenAI API" — <https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api>
[^chroma-rot]: Hong, Troynikov & Huber, "Context Rot: How Increasing Input Tokens Impacts LLM Performance," Chroma Research (2025) — <https://research.trychroma.com/context-rot>
[^redis-bloat]: J. A. Wallace, "Prompt bloat: causes, costs & fixes for LLM apps," Redis Blog (2026) — <https://redis.io/blog/prompt-bloat-llm-apps/>
[^inventivehq]: InventiveHQ, "Optimizing Prompts to Reduce Token Usage and Costs" — <https://inventivehq.com/blog/optimize-prompts-reduce-token-costs>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
