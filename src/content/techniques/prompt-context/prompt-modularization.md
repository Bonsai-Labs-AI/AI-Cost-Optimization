---
title: "Prompt Modularization"
category: prompt-context
maturityLevel: 1
maturityProvisional: false
shortDescription: "Compose prompts from reusable, independently-editable blocks (system / tools / policy / examples) ordered static-first, volatile-last — so the shared prefix stays byte-stable and maximizes prompt-cache hits, with deduplication and maintainability as the secondary wins."
effort: Low
gain: Low
riskToQuality: Low
effortWhy: Low because it is ordinary software hygiene — partials, a shared library, and a fixed block order — applied to prompts you already have.
gainWhy: Low because modularization moves no tokens off the wire itself; it is an enabler whose savings only materialize once the stable prefix is cached.
riskWhy: Low because reordering and reusing blocks preserves the same content and tokens, changing structure rather than what the model sees.
detectionSignals:
  - "Copy-pasted fragments — policies, tool descriptions, and few-shot examples are duplicated across call sites with no shared library."
  - "Interleaved volatile data — timestamps, user names, session IDs, or retrieved snippets sit inside the system block, breaking the cacheable prefix."
  - "Drifted blocks — the same instruction or example has fallen out of sync between two features because each was edited independently."
  - "No static/dynamic boundary — every call assembles a bespoke string rather than concatenating versioned blocks."
measurementMethods:
  - "Prefix-cache hit rate — cached input tokens ÷ total input tokens, before vs. after restructuring blocks static-first."
  - "Duplicate fragments removed — count of copy-pasted prompt fragments or lines of prompt text eliminated."
  - "Distinct prefix variants — number of prompt prefixes in production, where fewer byte-identical variants mean more cache reuse."
  - "Edit blast radius — how many features a single block change propagates to vs. the number of files touched."
status: published
lastUpdated: "2026-06-29"
related:
  - "prompt-context/prompt-cleanup"
  - "caching-reuse/prompt-caching-prefix-caching"
  - "caching-reuse/cache-aware-agent-design"
sources:
  - id: manus-context
    title: "Context Engineering for AI Agents: Lessons from Building Manus"
    publisher: "Manus (Yichao 'Peak' Ji)"
    year: 2025
    url: "https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus"
    accessed: "2026-06-29"
    kind: blog
    note: "KV-cache hit rate is the single most important metric for a production agent; ~100:1 input:output ratio; cached input 0.30 vs uncached 3.00 USD/MTok on Claude Sonnet (10x). Keep the prefix stable, context append-only, and serialization deterministic (sort JSON keys)."
  - id: anthropic-ce
    title: "Effective context engineering for AI agents"
    publisher: "Anthropic — Engineering Blog"
    year: 2025
    url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
    accessed: "2026-06-29"
    kind: blog
    note: "Organize prompts into distinct sections (XML tags / Markdown headers: background_information, instructions, tool guidance, output description); find the smallest set of high-signal tokens; calibrate 'altitude' between brittle hardcoding and vague guidance."
  - id: openai-pc-docs
    title: "Prompt caching — structuring prompts for cache hits"
    publisher: "OpenAI API Docs"
    year: 2026
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-06-29"
    kind: docs
    note: "Cache hits require exact prefix matches; place static content (instructions, examples) at the beginning and variable content at the end. Tools and images must be identical between requests to cache."
  - id: anthropic-pc
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    year: 2026
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-06-29"
    kind: docs
    note: "Cacheable spans are marked with cache_control breakpoints over a contiguous prefix; cache reads cost 0.1x base input. The prefix must be byte-identical to hit."
  - id: kvcache-bench
    title: "KV-Cache Aware Prompt Engineering: How Stable Prefixes Unlock Latency Improvements"
    publisher: "ankitbko.github.io (F5 / Squashing Bugs)"
    year: 2025
    url: "https://ankitbko.github.io/blog/2025/08/prompt-engineering-kv-cache/"
    accessed: "2026-06-29"
    kind: benchmark
    note: "Measured: stable-prefix prompts hit an 85.2% cache rate vs 0% for perturbed prompts; ~65% median TTFT improvement and ~71% lower per-request cost. 'Keep system prompts sacred and stable'; sort object keys; put user context in the user message."
---

## Overview

A prompt is rarely one monolithic string. In production it is an assembly of distinct
parts: a system/role block, tool and function definitions, a policy or guardrail block,
a set of few-shot examples, retrieved context, and finally the per-request user input.
**Prompt modularization** is the practice of building the prompt by *composing named,
reusable, independently-editable blocks* — and, critically, ordering those blocks so the
shared, unchanging ones form a stable prefix and the volatile ones come last.

The honest framing up front: modularization is **largely an enabler, not a direct cost
saver**. Splitting a prompt into blocks does not, by itself, reduce token count — the same
tokens still go over the wire. Its gain is **Low–Medium**, and it earns that score in two
indirect ways. First and most importantly, a clean static/volatile split is what makes
**prompt caching** actually pay off: caches only hit on a byte-identical contiguous prefix,
so the discipline of "static blocks first, volatile data last" is the precondition for a
high cache-hit rate.[^openai-pc-docs][^anthropic-pc] Second, reusable blocks remove
*duplicated* prompt text across call sites and let you edit one canonical block instead of
hunting down copy-pasted fragments — a maintainability and drift win that indirectly avoids
the slow bloat that costs tokens.

This is distinct from its sibling, **Prompt Cleanup**: cleanup is about *removing* waste
(dead instructions, redundant restatements); modularization is about *structuring and
reusing* what remains. You do both — cleanup shrinks each block, modularization arranges
the blocks so they cache and stay maintainable. It sits at **Level 1** because it is low
effort, low risk, and a near-universal prerequisite for the caching economics that deliver
the real savings.

## Detailed Approach & Techniques

### Order blocks static-first, volatile-last

The single rule that converts modularization into cost savings is ordering. Caching works
only on an exact-match **contiguous prefix**; the moment the token stream diverges from the
cached version, everything after that point is recomputed at full price.[^openai-pc-docs]
So arrange blocks from most-stable to most-volatile:

> system / role → tool & function definitions → policy & guardrails → few-shot examples →
> long shared context → **then** the per-request user input and any timestamps.

OpenAI's guidance is explicit: "place static content like instructions and examples at the
beginning of your prompt, and put variable content, such as user-specific information, at
the end," and tools and images "must be identical between requests" to cache.[^openai-pc-docs]
A measured benchmark of exactly this restructuring found stable-prefix prompts reached an
**85.2% cache-hit rate versus 0%** for prompts that interleaved volatile data, with roughly
**65% lower time-to-first-token and ~71% lower per-request cost** as a result — the savings
come from caching, which the modular ordering unlocks.[^kvcache-bench]

The classic failure mode this prevents: putting a per-second timestamp or a user name at the
**top** of the system block. Manus calls this out directly — "A common mistake is including
a timestamp ... at the beginning of the system prompt" — because a single-token change
invalidates the entire downstream cache.[^manus-context] Move volatile values into the user
message or the tail of the prompt where they belong.[^kvcache-bench]

### Make blocks byte-stable and deterministic

A "reusable block" only caches if it serializes **identically** every call. Two practical
requirements:

- **Deterministic serialization.** Many languages don't guarantee stable JSON key ordering;
  non-deterministic key order silently breaks the prefix match. Sort keys
  (`json.dumps(data, sort_keys=True)`) and pin whitespace/formatting for any structured block
  embedded in the prompt.[^manus-context][^kvcache-bench]
- **Append-only context** for multi-turn and agent loops. Never rewrite earlier blocks or
  observations; append new turns to the end so the long shared prefix stays intact. This is
  the bridge to *Cache-Aware Agent Design*.[^manus-context]

### Structure each block with clear delineation

Within the modular layout, give each block a clear boundary. Anthropic recommends organizing
prompts into distinct sections — `<background_information>`, `<instructions>`,
`## Tool guidance`, `## Output description` — using XML tags or Markdown headers, while
"striving for the minimal set of information that fully outlines your expected behavior."[^anthropic-ce]
Named sections are what make a block independently editable (you can swap the policy block
without touching examples) and what keep the model's attention on high-signal tokens.[^anthropic-ce]

### Implement as a versioned prompt library

Mechanically, this is ordinary software hygiene applied to prompts:

1. **Partials/templates.** Store each block (system, tools, policy, examples) as a named
   partial; compose the final prompt by concatenating them in the fixed static-first order
   with the user input injected last.
2. **A shared prompt library.** Define each canonical block once and import it across features
   so a single edit propagates everywhere — eliminating copy-pasted drift and shrinking the
   number of distinct prefix variants in production (fewer, identical prefixes → more cache
   reuse).
3. **Versioned blocks.** Version each block so prompt changes are reviewable and so you can
   tag spend by prompt version (pairs with *Tag-Based Cost Attribution*). Note that *any* edit
   to a cached block invalidates its cache until traffic re-warms it — a reason to batch prompt
   changes rather than tweak the static block continuously.[^anthropic-pc]

### Mark the cache boundaries

On providers with explicit caching (Anthropic), place a `cache_control` breakpoint at the end
of the stable block stack so the system + tools + policy + examples prefix is cached and only
the volatile tail is billed fresh.[^anthropic-pc] On automatic-caching providers (OpenAI,
Gemini implicit) the modular ordering alone is what earns the hit — no breakpoint needed, but
the static-first discipline is still mandatory.[^openai-pc-docs] See *Prompt Caching / Prefix
Caching* for the full provider economics.

## Example Where It Works

A team runs three features off one provider — a chat assistant, an email drafter, and a
support-ticket classifier — that all share the same tone/policy guidance and an overlapping
set of tool definitions. Originally each feature had its own hand-assembled prompt string with
the policy text copy-pasted (and slightly drifted) into all three, and each interpolated the
current timestamp near the top "for context."

Refactoring to modular blocks: a single canonical `policy` partial and `tools` partial imported
by all three features, ordered system → tools → policy → examples → user input, with the
timestamp moved into the user turn. Two things follow. The drift is gone — one edit to the
policy block now updates all three features, and the number of distinct prompt prefixes in
production collapses to a handful of byte-identical variants. More importantly, those identical
prefixes now **cache**: where the timestamp-at-the-top version got a 0% cache rate, the stable
prefix reaches the 80%+ range, and because the input-to-output ratio in these features is high
(the shared prefix dwarfs the short user turn), the cached prefix bills at ~0.1× and blended
input cost drops sharply.[^kvcache-bench][^anthropic-pc] The savings are *caching's*, but they
were unreachable until the prompt was modularized and ordered correctly — that is the enabler
relationship in action.[^manus-context]

## Example Where It Would NOT Work

- **No reused prefix to stabilize.** A one-off bulk pipeline that classifies unrelated
  documents with a tiny shared instruction and a large *unique* body per request has almost
  nothing to modularize for caching benefit — the unique body comes right after the short
  instruction, so there is no long stable prefix to preserve. Modularizing the two-line
  instruction buys maintainability at best, not cost; *Batch API* and *Model Right-Sizing* are
  the levers here.[^openai-pc-docs]

- **Expecting modularization itself to cut the bill.** A team splits a 6k-token prompt into
  neat blocks, ships it, and is surprised the token count is unchanged. It is — modularization
  moves no tokens off the wire on its own; the savings only materialize when the stable prefix
  is actually cached (and on cold/low-volume endpoints the cache may never warm). If the goal
  is fewer tokens, that is *Prompt Cleanup* and *Long-Context Avoidance*, not modularization.

- **Inherently volatile prompts.** A prompt whose "system" content genuinely changes every call
  — per-user generated instructions, a freshly retrieved document set with no overlap — has no
  stable block to cache no matter how cleanly it is structured. Forcing a modular layout adds
  template machinery without a payoff; the honest call is to skip it.

- **Over-engineering a small surface.** A product with one prompt used in one place gains nothing
  from a versioned partial library and a template engine — the abstraction costs more than the
  duplication it would remove. Modularization earns its keep when blocks are genuinely shared
  across several call sites or reused across many turns.

[^manus-context]: Manus (Yichao "Peak" Ji), "Context Engineering for AI Agents: Lessons from Building Manus" — <https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus>
[^anthropic-ce]: Anthropic, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
[^openai-pc-docs]: OpenAI API Docs, "Prompt caching" (structuring prompts for cache hits) — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^anthropic-pc]: Anthropic, "Prompt caching," Claude API Docs — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^kvcache-bench]: ankitbko / F5, "KV-Cache Aware Prompt Engineering: How Stable Prefixes Unlock Latency Improvements" — <https://ankitbko.github.io/blog/2025/08/prompt-engineering-kv-cache/>
