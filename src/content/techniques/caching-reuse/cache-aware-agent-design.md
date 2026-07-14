---
title: "Cache-Aware Agent Design"
category: caching-reuse
maturityLevel: 3
maturityProvisional: false
shortDescription: "Design the agent loop so its prompt prefix stays byte-stable across steps (static-first, append-only history, fixed tools) so the growing context is re-read from cache instead of re-billed at full price on every step."
effort: Medium
gain: High
riskToQuality: Low
detectionSignals:
  - "Low cache_read share on agent traffic despite a large, mostly-static system prompt and tool schema."
  - "The prefix mutates every step: timestamps, reordered/added/removed tools, rewritten earlier turns, or 'working memory' edited in place near the top."
  - "Per-step input cost grows across a run even though most of the context is unchanged."
  - "Agent runs are long (dozens of steps) with a high input-to-output token ratio."
measurementMethods:
  - "Prefix-cache hit rate across a full run (cache_read_input_tokens ÷ total input tokens)."
  - "Cached-token share and cache_creation (write) share per step over a long run."
  - "Cost per run and per step before vs. after the design change."
  - "Count of cache-invalidating prefix mutations per run (should trend to zero)."
status: published
lastUpdated: "2026-07-03"
related:
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/cache-hit-rate-instrumentation"
  - "caching-reuse/tool-result-caching"
  - "prompt-context/structured-context-packing"
  - "agent-workflow/state-compression-for-agents"
sources:
  - id: manus
    title: "Context Engineering for AI Agents: Lessons from Building Manus"
    publisher: "Manus (Yichao 'Peak' Ji)"
    year: 2025
    url: "https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus"
    accessed: "2026-07-03"
    kind: blog
    note: "KV-cache hit rate is 'the single most important metric for a production-stage AI agent.' Agent input:output ratio ~100:1. On Claude Sonnet, cached input $0.30/MTok vs uncached $3.00/MTok — 10x. Three rules: keep the prefix stable (no timestamps), make context append-only with deterministic serialization, and mask tools rather than adding/removing them mid-run."
  - id: projectdiscovery-pc
    title: "How We Cut LLM Costs by 59% With Prompt Caching"
    publisher: "ProjectDiscovery Blog"
    year: 2026
    url: "https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching"
    accessed: "2026-07-03"
    kind: blog
    note: "Agent 'Neo': 20k+-token system prompt (2,500+ lines YAML), ~26 steps and 40 tool calls per task. Working memory sitting inside the cacheable prefix invalidated it nearly every step → 7.6% hit rate (Feb 9). Relocating dynamic content to a trailing <system-reminder> user message raised the hit rate to 84.3% (Mar 16) and cut LLM cost 59% overall. One task hit 91.8% cache rate across 1,225 steps / 67.5M input tokens."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Invalidation is hierarchical: tools → system → messages; a change at any level invalidates that level and everything after. Changing tool definitions invalidates the whole cache; tool_choice, images, and thinking-parameter changes invalidate the message cache. Cache write 1.25x (5-min) / 2x (1-hour) base input; cache read 0.1x. Lookback window is 20 blocks — a growing conversation needs a second breakpoint before older writes fall out of the window."
  - id: anthropic-context-eng
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-07-03"
    kind: blog
    note: "An agent in a loop 'generates more and more data that could be relevant for the next turn.' For long-horizon tasks: compaction (summarize and reinitialize), structured note-taking (persist memory outside the window), and sub-agents that return condensed 1,000–2,000-token summaries."
  - id: openai-pc-docs
    title: "Prompt caching"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-07-03"
    kind: docs
    note: "Automatic, no code change. Put static content (instructions, examples) at the beginning and variable content (user-specific info) at the end. Prompts ≥1,024 tokens. Up to 90% input-cost and 80% latency reduction. Cache clears after ~5–10 min idle, up to 1 hour."
  - id: vllm-apc
    title: "Automatic Prefix Caching"
    publisher: "vLLM Documentation"
    year: 2026
    url: "https://docs.vllm.ai/en/stable/design/prefix_caching/"
    accessed: "2026-07-03"
    kind: docs
    note: "Self-hosted equivalent: the KV cache of a shared prefix is reused across requests, skipping prefill of the shared part. The same divergence rule applies — a differing token ends the reusable prefix."
---

## Overview

An LLM agent runs the model in a loop: each step re-sends the **entire context so far**
— system prompt, the full tool schema, and every prior action and observation — and
appends one more step's worth of output. Because the context only grows, a naïve agent
re-processes an ever-larger prefix at **full input price on every step**. Over a run of
dozens of steps this is the dominant cost: agent workloads are extremely input-heavy,
with an average input-to-output token ratio around **100:1**.[^manus]

Prompt caching (see *Prompt Caching / Prefix Caching*) exists precisely to make that
re-reading cheap — a cache read costs **0.1×** the base input price on Anthropic, and
cached input is roughly **10× cheaper** than uncached.[^anthropic-pc][^manus] But the
discount only applies to a **contiguous, byte-identical prefix**. The moment the token
stream diverges from what was cached, the cache stops at the divergence point and
everything after it is recomputed at full price.[^anthropic-pc][^vllm-apc]

**Cache-aware agent design** is the design-time discipline of building the agent loop so
that its prefix *stays stable step to step*: static content first, history strictly
appended (never rewritten), and tools held fixed for the run. Done well, it turns the
O(n) full-price re-processing of a growing context into cheap cache reads. As the Manus
team put it, **KV-cache hit rate is "the single most important metric for a
production-stage AI agent."**[^manus] This is Level 3 because it is not a config toggle:
it constrains how you assemble prompts, manage state, and structure tools across the
whole agent — but the payoff is large and the quality risk is essentially nil, since
caching changes billing and latency, not the tokens the model sees.

## Detailed Approach & Techniques

### The one rule everything follows from

Caching keys on a prefix hash. **Any mutation to an earlier part of the prompt
invalidates the cache from that point onward.** Provider invalidation is hierarchical:
on Anthropic the order is `tools → system → messages`, and a change at any level
invalidates that level **and everything after it**.[^anthropic-pc] So the design goal is
simple to state and easy to violate: **keep the front of the prompt frozen, and only ever
grow it at the tail.**

### Rule 1 — Static-first, volatile-last ordering

Order the context so the stable material forms the cacheable prefix and per-step/per-user
material sits at the end:

1. Tool / function definitions
2. System instructions and long shared context (docs, few-shot examples)
3. Conversation and tool-call history (appended, oldest-first)
4. The current step's new input

Both OpenAI and Anthropic document this directly: put static content at the beginning and
variable content at the end.[^openai-pc-docs][^anthropic-pc] The classic anti-pattern is a
**timestamp precise to the second at the top of the system prompt** — it changes every
call, so the prefix hash never matches and you pay a cache *write* every step and never get
a read.[^manus][^anthropic-pc]

### Rule 2 — Append-only history, deterministic serialization

Make the context **append-only**: never edit a previous action or observation in place;
add new turns at the end. And ensure serialization is **deterministic** — if your JSON
serializer re-orders keys, or whitespace/formatting drifts between steps, the prefix
diverges even though the semantic content is identical.[^manus] The single most damaging
pattern is putting **mutable "working memory" or scratch state inside the cached prefix**:
because it changes almost every step, it silently invalidates everything below it. This is
exactly what happened to ProjectDiscovery's agent "Neo" (a 20,000+-token system prompt);
the fix was to move that dynamic content out of the prefix and into a **trailing
`<system-reminder>` user message** — a pure reordering, no logic change.[^projectdiscovery-pc]

### Rule 3 — Don't change the tool set mid-run

Adding, removing, or reordering tools rewrites the very front of the prefix and blows the
whole cache (tools are the outermost invalidation level).[^anthropic-pc] Yet agents often
want to expose different tools at different phases. The cache-aware pattern is to keep the
tool *definitions* fixed for the run and instead **mask which tools are selectable** — a
state machine plus logit masking during decoding constrains the action space **without
mutating the tool block in context**.[^manus] Also hold cache-affecting request parameters
steady across steps: on Anthropic, toggling `tool_choice`, adding/removing images, or
changing thinking/`speed` settings invalidates the message (or full) cache.[^anthropic-pc]

### Rule 4 — Manage the growing tail without breaking the head

Caching helps the loop re-read cheaply, but the context still grows. Two levers keep it
bounded *without* wrecking cache stability:

- **Breakpoint placement.** Anthropic's lookback window is **20 blocks**; in a long run
  the earliest cache write falls out of that window and you miss. Place a second
  `cache_control` breakpoint further down (e.g. a sliding window over recent history with a
  5-minute TTL, while the system/tools block carries a 1-hour TTL) so each step still
  matches a live prefix.[^anthropic-pc]
- **Compact at the tail, not the head.** When the tail gets too large, use *compaction*
  (summarize older turns), *note-taking* (persist state outside the window), or *sub-agents*
  that return condensed 1,000–2,000-token summaries.[^anthropic-context-eng] Do this at a
  *deliberate boundary* — compacting reshapes the prefix and forces one cache write, so the
  win is amortizing that over many subsequent cheap reads, not compacting every step. (See
  *State Compression for Agents* and *Structured Context Packing*.)

### The silent invalidators — a checklist

Every item below mutates the prefix and quietly kills the cache from that point down:

- A timestamp / request ID / random nonce near the top of the prompt.[^manus]
- Editing "working memory" or scratch state that lives inside the cached prefix.[^projectdiscovery-pc]
- Non-deterministic JSON serialization (re-ordered keys, drifting whitespace).[^manus]
- Adding, removing, or reordering tool definitions mid-run.[^manus][^anthropic-pc]
- Rewriting an earlier turn instead of appending a new one.[^manus]
- Toggling `tool_choice`, injecting/removing an image, or flipping thinking/`speed` params
  between steps.[^anthropic-pc]
- Letting the growing tail push the last cache write outside the 20-block lookback window
  with no second breakpoint.[^anthropic-pc]

## Example Where It Works

A code/security agent with a **~20,000-token** system prompt and a large tool schema runs
**~26 steps and ~40 tool calls per task**. Initially its dynamic "working memory" sat
*inside* the system-prompt prefix, so nearly every step invalidated the cache — the hit
rate was **7.6%** and almost all input was billed at full price.[^projectdiscovery-pc]

Relocating that volatile content to a **trailing user message** (static-first ordering)
and keeping the tool block fixed made the whole 20k-token head cacheable. The prefix-cache
hit rate rose to **84.3%**, and overall LLM cost fell **~59%** — with a later steady state
around 66–70%.[^projectdiscovery-pc] On a single large task the cache rate reached
**91.8%** across **1,225 steps / 67.5M input tokens**: at that scale, with cached input at
**0.1×** price, the difference between re-reading the prefix at full price versus from
cache is enormous.[^projectdiscovery-pc][^anthropic-pc] This is the canonical case: a
long-running, input-heavy loop where a design-only change (no model change, no quality
change) delivers a large, durable cut.

## Example Where It Would NOT Work

- **Short, single-shot calls.** If the agent is really one prompt in, one answer out — no
  loop, few steps, and a prefix below the provider minimum (**1,024 tokens** on OpenAI /
  Anthropic) — there is little repeated prefix to protect. Plain *Prompt Caching* (L1) or a
  *smaller model* is the right lever; there's no multi-step loop to design around.[^openai-pc-docs][^anthropic-pc]
- **Genuinely dynamic tool sets.** An agent whose available tools legitimately change from
  step to step (e.g. tools discovered at runtime and injected mid-run) can't hold the tool
  block stable, so the outermost prefix mutates by design. Unless you can restructure it as
  masking over a fixed superset of tools, cache-aware ordering buys little.[^manus][^anthropic-pc]
- **Cold or low-volume agents.** Provider caches evict after ~5–10 minutes of inactivity.
  A rarely-invoked agent, or one with long human-in-the-loop pauses between steps, keeps
  paying cache **writes** without reaching enough **reads** to amortize them (Anthropic's
  write is 1.25×–2× base input).[^anthropic-pc][^openai-pc-docs] Warm, sustained runs are
  where the design pays off.
- **Output-bound work.** Caching discounts **input** only. An agent whose cost is dominated
  by long generations, not context re-reading, sees little from prefix stability — on
  self-hosted stacks this is explicit: prefix caching cuts prefill, not decode.[^vllm-apc]

[^manus]: Manus (Yichao "Peak" Ji), "Context Engineering for AI Agents: Lessons from Building Manus," 2025 — <https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus>
[^projectdiscovery-pc]: ProjectDiscovery, "How We Cut LLM Costs by 59% With Prompt Caching," 2026 — <https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^anthropic-context-eng]: Anthropic, "Effective context engineering for AI agents," Engineering Blog, 2025 — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^vllm-apc]: vLLM Documentation, "Automatic Prefix Caching" — <https://docs.vllm.ai/en/stable/design/prefix_caching/>
