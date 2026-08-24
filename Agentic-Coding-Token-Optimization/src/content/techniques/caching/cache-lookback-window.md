---
title: "Watch the ~20-block cache lookback window"
group: caching
level: 2
costLever: [cache]
effort: Medium
savingEstimate: "varies — recovers cache reads otherwise lost"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - aider
  - cline
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "context/tool-output-filtering"
sources:
  - id: anthropic-cache
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Lookback window is 20 blocks: the system checks at most 20 positions per breakpoint, counting the breakpoint itself as the first; up to 4 cache_control breakpoints per request; cache_control goes on tools, system, and message blocks including tool_use/tool_result."
  - id: anthropic-skills-cache
    title: "Prompt caching (claude-api skill)"
    publisher: "anthropics/skills"
    url: "https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md"
    accessed: "2026-08-10"
    kind: repo
    note: "Each breakpoint walks back at most 20 content blocks; a single turn that adds >20 blocks (agentic loops with many tool_use/tool_result pairs) silently misses the prior cache. Fix: intermediate breakpoint every ~15 blocks, or keep the marker within 20 of the previous turn's last cached block."
  - id: anthropic-pricing
    title: "Pricing"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Cache read = 0.1x base input; 5-min write = 1.25x; 1-hr write = 2x. A miss reprocesses at full input price plus the write premium."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Aider organizes chat history into cacheable sections (system prompt, read-only files, repo map, editable files) and exposes --cache-prompts and --cache-keepalive-pings; default Anthropic TTL is 5 minutes."
  - id: prompt-cache-skills
    title: "prompt-cache-skills — cache-breakpoint fixes for agent harnesses"
    publisher: "OnlyTerp (GitHub)"
    url: "https://github.com/OnlyTerp/prompt-cache-skills"
    accessed: "2026-08-10"
    kind: repo
    note: "Practitioner source: Cline/Roo/Continue place a fixed set of breakpoints (a 'last 2 user messages' pattern) rather than managing the 20-block window per turn."
---

## What & why

A cache breakpoint doesn't scan the whole prompt for a prior cache entry — it walks backward only about 20 content blocks. On each request the system hashes the prefix at your breakpoint and looks for a match in the cache; if it doesn't find one it steps back one block at a time, and it gives up after 20 positions.[^anthropic-cache] A single agentic turn that adds more than 20 blocks — common when the model fires many `tool_use`/`tool_result` pairs in one turn — pushes the previous turn's cached prefix out of that window, so the next request misses the cache silently and reprocesses the whole context at full input price plus the write premium.[^anthropic-skills-cache] The lever is cache hits: keeping breakpoints within reach of the last write is the difference between a 0.1x read and a full-price reprocess.[^anthropic-pricing]

## How to do it

The portable rule: **never let a breakpoint sit more than ~20 blocks past the last cached prefix.** In a tool-heavy turn, place intermediate breakpoints roughly every 15 blocks so each request always has a prior write inside the 20-block window, and spend your budget of 4 `cache_control` breakpoints per request deliberately — put them on stable content (tools, system, older turns), not on the volatile current turn.[^anthropic-cache][^anthropic-skills-cache]

Concretely, when you control the request (an API or custom-harness setup):

1. **Count the blocks a turn adds.** Each `tool_use` and each `tool_result` is its own content block. A turn with ten tool calls is already twenty-plus blocks — past the window on its own.
2. **Add an intermediate breakpoint every ~15 blocks** in long turns, or move the marker onto a block that's within 20 of the previous turn's last cached block.[^anthropic-skills-cache]
3. **Cache the stable prefix, not the moving tail.** Keep breakpoints on tool definitions, the system prompt, and settled earlier turns so the write is reused; a breakpoint burned on the current user message caches something that changes next turn.

This is mostly an API / custom-harness concern. Most off-the-shelf IDE tools place breakpoints for you and you can't move them — see this technique's row in `TOOL_MATRIX.md` for which tools expose a knob (Aider, which caches its four chat-history sections and lets you keep the write warm[^aider-caching]), which manage it internally, and which have a known fixed-breakpoint pattern (Cline/Roo).

## When it's worth it / when not

- **Worth it:** you drive the Claude API directly or run a custom harness, and your turns routinely fire many tools (search, read, edit, test in one turn). This is exactly where the window overflows.
- **Worth it:** you see cache-read tokens collapse to near zero on long tool-heavy turns while cost stays high — the classic silent-miss signature.
- **Not worth it:** you use a managed IDE tool (Cursor, Copilot, Grok Build) where breakpoint placement is provider-controlled — you have no knob to turn, so the lever is "pick a tool that handles it," not "tune it."
- **Not the first thing to reach for:** if turns are short (a handful of blocks), the window is never the bottleneck; spend effort on TTL and dev-loop-noise filtering first.

## What it costs you

- **Setup effort** is Medium: you have to instrument breakpoint placement in the harness and keep it correct as turn shapes change.
- **The failure mode is silent** — nothing errors; you just stop getting cache reads and pay full price. Without watching cache-read tokens you won't notice.
- **Breakpoints are scarce** (4 per request). Spending them on intermediate markers in a long turn means fewer for coarse-grained caching elsewhere; place them where the token mass actually is.
- **Over-marking the volatile tail** wastes a write every turn on content that won't be reused — the opposite of the goal.

## How to verify

- Watch **cache-read vs cache-creation (write) tokens per turn**. A healthy long turn shows most input arriving as cache reads (0.1x); a windowed-out turn shows reads dropping to near zero and creation/full-input spiking on a prefix that didn't change.
- In Claude Code, `/usage` flags cache-miss when it's a large share of recent usage; native OpenTelemetry splits token usage into `cacheRead` / `cacheCreation`, and `ccusage` shows the same split per session — compare a short turn against a tool-heavy one on the same repo.

## Measured impact

_Not yet measured by us._ Benchmark: run the same tool-heavy task on a custom Claude API harness with breakpoints left at defaults vs. with intermediate breakpoints every ~15 blocks, and compare cache-read token share and cost per passing task (baseline vs. the variant applying this technique). Cited so far: Anthropic documents the 20-block lookback and the agentic-loop miss, and prescribes the ~15-block intermediate-breakpoint fix.[^anthropic-cache][^anthropic-skills-cache] ⚠ The per-harness breakpoint behavior (e.g. Cline/Roo's fixed pattern) is practitioner-sourced and not independently verified.[^prompt-cache-skills]

[^anthropic-cache]: Claude Platform Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^anthropic-skills-cache]: anthropics/skills, "Prompt caching (claude-api skill)" — <https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md>
[^anthropic-pricing]: Claude Platform Docs, "Pricing" — <https://platform.claude.com/docs/en/about-claude/pricing>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^prompt-cache-skills]: OnlyTerp, "prompt-cache-skills" — <https://github.com/OnlyTerp/prompt-cache-skills>
