---
title: "Keep the cache warm across short breaks"
group: caching
level: 2
costLever: [cache, input]
effort: Low
savingEstimate: "avoids full re-processing on the next turn"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - aider
  - claude-code
  - cline
  - cursor
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/iterate-within-ttl"
sources:
  - id: anthropic-caching
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "5-min default TTL refreshed for free on each cache use; measured from request start; 1-hr option; cache pre-warming with max_tokens:0; per-model minimum cacheable length (1,024 tokens for Sonnet 5)."
  - id: anthropic-pricing
    title: "Pricing — prompt caching multipliers"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Read 0.1x base input; 5-min write 1.25x; 1-hr write 2x. Break-even after 1 read (5-min) or 2 reads (1-hr)."
  - id: cc-costs
    title: "Manage costs — cache lifetime by billing path"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache TTL 1 hr on subscription, 5 min on usage credits or API/cloud; ENABLE_PROMPT_CACHING_1H keeps 1 hr on usage credits."
  - id: aider-options
    title: "Options reference — --cache-prompts, --cache-keepalive-pings"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/config/options.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-keepalive-pings N (default 0): number of times to ping at 5-min intervals to keep prompt cache warm."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-keepalive-pings N pings every 5 min, up to N times over N*5 minutes after each message; default Anthropic TTL is 5 min."
  - id: gemini-implicit
    title: "Gemini 2.5 Models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: docs
    note: "Implicit caching on by default for Gemini 2.5+; no user TTL control; can't guarantee a hit."
---

## What & why

Prompt caches expire on a timer. Anthropic's default cache lives 5 minutes and is refreshed for free
every time the cached prefix is read, so a steady back-and-forth stays warm on its own.[^anthropic-caching]
The problem is bursty work: you fire off a few turns, then step away — a meeting, a code review, lunch —
and the gap runs past the TTL. The next turn is a cache miss, so the whole prefix (rules file, repo map,
open files, tool definitions) is re-processed at full input price instead of the 0.1x cache-read
rate.[^anthropic-pricing] Keeping the cache warm across those short breaks turns what would be a full
re-write into a cheap read. The lever is cache hits vs. full re-processing.

## How to do it

There are two portable moves, and which one you get depends on whether you drive the model through a CLI
or call the API yourself.

1. **Match the TTL to your break length first.** If your idle gaps are routinely longer than 5 minutes,
   the cheapest fix is a longer cache window, not pinging — switch to the 1-hour cache
   ([`caching/iterate-within-ttl`](../caching/iterate-within-ttl.md)). Reserve keep-warm pings for gaps that sit *just* over
   the short TTL, where paying for a 1-hour write (2x vs 1.25x) every burst would cost more than it
   saves.[^anthropic-pricing] Note that in Claude Code the cache window already depends on your billing
   path — 1 hour on a subscription, 5 minutes on usage credits or an API key/cloud — so keep-warm pings
   mostly matter on the 5-minute paths; `ENABLE_PROMPT_CACHING_1H=1` extends usage-credit sessions to 1
   hour and often removes the need to ping at all.[^cc-costs]

2. **Send a lightweight request that touches the cached prefix before the timer runs out.** Any read of
   the cached prefix resets its 5-minute clock, so a minimal request keeps it alive.[^anthropic-caching]
   - **CLI tools that expose it (Aider):** turn on caching and let the tool ping for you. Aider fires a
     keep-alive ping at 5-minute intervals after each message, up to a number you set — no manual
     scripting.[^aider-options][^aider-caching]
   - **When you call the API yourself:** send a pre-warm request against the same cached prefix with
     `max_tokens: 0`. The model runs the prefill, writes/refreshes the cache, and returns immediately with
     empty content — so you re-arm the cache for the next burst without paying for generation. Anthropic
     documents this as the cache pre-warming pattern; for the 5-minute cache, send one at least every 5
     minutes across the gap.[^anthropic-caching]

**Important:** the cached prefix has to clear the per-model minimum to cache at all — 1,024 tokens on
Sonnet 5, more on some models — or the request is processed uncached with no error.[^anthropic-caching]
The TTL is also measured from the *start* of the request, so a long-running turn eats into the window; a
follow-up must start within the remaining time, not the wall-clock 5 minutes.[^anthropic-caching]

For the exact per-tool knob, see this technique's row in `TOOL_MATRIX.md`. Most IDE and agent tools manage
caching for you and expose no keep-warm dial (marked `(managed)`); Aider is the main one with an explicit
flag. Gemini CLI is a different case entirely: on Gemini 2.5+ implicit caching is on by default with no TTL
you can set and no guaranteed hit, so there's nothing to keep warm and no knob to reach for.[^gemini-implicit]

## When it's worth it / when not

- **Worth it:** bursty sessions with a large, stable prefix (big rules file, wide repo map, many open
  files) and idle gaps that land just past the short TTL — the exact case where the next turn would
  otherwise re-process everything.
- **Worth it:** a shared or long-lived agent process that services requests in spurts.
- **Not worth it:** gaps consistently longer than the TTL — use the 1-hour cache instead of pinging every
  few minutes.
- **Not worth it:** a small prefix below the cacheable minimum (nothing to keep warm), or continuous work
  with no real idle gaps (the cache already refreshes on every turn).
- **Not worth it:** you're done for the day — let it expire rather than pinging into the void.

## What it costs you

- **Each keep-warm request still costs a cache read** (0.1x base input on the cached prefix) plus a small
  amount for any non-cached tail.[^anthropic-pricing] Pinging through a long gap can add up to more than a
  single cache miss would have cost — so cap the number of pings and prefer the 1-hour TTL for long gaps.
- **No quality risk.** A `max_tokens: 0` pre-warm produces no content and doesn't touch the conversation;
  Aider's pings run in the background. Nothing the model does downstream changes.
- **Setup effort is Low.** In Aider it's one flag. For API callers it's a small scheduled request against
  the same prefix — the failure mode is drift: if your real prefix changes (different rules file, tools,
  or order) the ping warms a cache the next real request won't hit. Keep the pre-warm prefix byte-identical
  to production.

## How to verify

- **Watch cache-read vs. cache-write (a.k.a. cache-creation) tokens on the first turn after a break.** A
  warm cache shows a large cache-*read* count and near-zero cache-*creation*; a miss shows the prefix
  re-billed as cache-creation or plain input. In Claude Code this splits out in `/usage` and in the OTel
  metric `claude_code.token.usage` (by `cacheRead` / `cacheCreation`); `ccusage` shows the same from local
  logs.
- **In Aider,** run with `--no-stream` so caching stats and costs are reported (they're suppressed while
  streaming).[^aider-caching]
- **Confirm the direction of the trade:** total spend with keep-warm on should be *lower* than the cache
  misses it prevents. If pinging costs more than the occasional miss, your gaps are too long for this
  technique — move to the 1-hour cache.

## Measured impact

_Not yet measured by us._ Benchmark: run the same bursty task twice on one repo with a large stable
prefix — a baseline that lets the 5-minute cache lapse across each idle gap (cache miss, full prefix
re-processed) vs. a variant that keeps the cache warm across the gap (Aider `--cache-keepalive-pings`, or a
`max_tokens: 0` pre-warm for the API path) — and compare cache-read vs. cache-creation tokens and cost per
task. Cited economics: cache reads are 0.1x base input vs. a full re-write at 1x, and the short-TTL write
(1.25x) pays for itself after one read.[^anthropic-pricing] ⚠ Vendor-published pricing multipliers, not
our own measurement.

[^anthropic-caching]: Claude Platform Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^anthropic-pricing]: Claude Platform Docs, "Pricing" — <https://platform.claude.com/docs/en/about-claude/pricing>
[^cc-costs]: Claude Code docs, "Manage costs" — <https://code.claude.com/docs/en/costs>
[^aider-options]: Aider docs, "Options reference" — <https://aider.chat/docs/config/options.html>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 Models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
