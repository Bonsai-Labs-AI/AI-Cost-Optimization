---
title: "Remove silent cache invalidators"
group: caching
level: 2
costLever: [input, cache]
effort: Medium
savingEstimate: "varies — restores cache reads (0.1x input) on a prefix that was silently missing"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - aider
  - copilot
  - codex
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/stable-prompt-prefix"
  - "caching/stable-tool-order-no-model-switch"
  - "caching/verify-cache-hitting"
  - "context/keep-rules-file-small"
sources:
  - id: anthropic-caching
    title: "Prompt caching (cache hits require 100% identical prefix; breakpoints)"
    publisher: "Claude API docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "\"Cache hits require 100% identical prompt segments, including all text and images up to and including the block marked with cache control.\" Invalidation is hierarchical (tools → system → messages). Warns against placing cache_control on content that changes every request (e.g. timestamps): the prefix hash changes each time so the lookback finds no prior write."
  - id: openai-caching
    title: "Prompt caching (exact prefix match; put variable content last)"
    publisher: "OpenAI API docs"
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Automatic caching, 1,024-token minimum. \"Cache hits are only possible for exact prefix matches within a prompt.\" Timestamps and per-request user content in the prefix break the cache; guidance is to put static content first and variable content last."
  - id: gemini-caching
    title: "Context caching (implicit caching; stable prefix guidance)"
    publisher: "Gemini API docs"
    url: "https://ai.google.dev/gemini-api/docs/caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Implicit caching auto-enabled on Gemini 2.5+. \"Try putting large and common contents at the beginning of your prompt\" and \"send requests with similar prefix in a short amount of time.\" 2,048–4,096-token minimum depending on model."
  - id: codex-cache-hits
    title: "Prompt caching in Codex CLI: how to maximise cache hits"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "\"Anti-Patterns That Destroy Cache Hits\": dynamic timestamps in system prompts (\"Session started: …\"), randomized tool ordering, auto-generated content (git line counts, timestamps) in AGENTS.md, versioned/build-numbered instructions in config.toml. Caching is automatic (no opt-in flag); pass session context via user messages, not the static prefix."
  - id: cc-prompt-caching
    title: "How Claude Code uses prompt caching"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "cache_read_input_tokens billed at ~10% of standard input; cache_creation at the write rate. Claude Code manages breakpoint placement; the user controls prefix content (CLAUDE.md, tools, config)."
  - id: aider-caching
    title: "Prompt caching (--cache-prompts; cached layers)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts enables caching; cached layers are system prompt, read-only files, repo map, then editable files. --no-stream needed to see cache stats/costs."
  - id: cache-econ
    title: "Prompt-cache economics (read 0.1x, 5-min write 1.25x, 1-hr write 2x)"
    publisher: "Claude API pricing"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Cache read = 0.1x base input; 5-min write = 1.25x; 1-hr write = 2x. A miss re-processes the prefix at full input rate (and re-writes)."
---

## What & why

Prompt caching only pays off when the cached prefix is **byte-identical** from one request to the next — every provider matches the cache on an exact prefix and misses on the first differing character.[^anthropic-caching][^openai-caching] A silent invalidator is a piece of content that looks static but changes every request: a timestamp in the system prompt, a UUID or request ID, a build number, or a JSON blob whose keys come back in a different order. Sitting anywhere in the cached prefix, it flips the prefix hash on every call, so the read that should have cost 0.1x input misses and the whole prefix is re-processed and re-written at full rate.[^cache-econ] The lever is cache hits: strip the varying content out of the prefix (or move it past the last breakpoint) and a prefix that was quietly missing starts hitting again.

This is the *silent* case, distinct from the deliberate prefix changes covered by the sibling pages — switching model, editing the rules file, or churning the tool/MCP set mid-session (see "Stable prompt prefix" and "Stable tool/MCP order"). Here you never touched the config, yet the prefix still differs every request because something auto-generated is embedded in it. That's what makes it easy to miss: the cache-read ratio is quietly low and nothing you did explains it.

## How to do it

The portable rule is: **everything before your last cache breakpoint must be the same bytes every request; everything that changes goes after it.**[^anthropic-caching][^openai-caching][^gemini-caching] So audit what your tool puts into the stable prefix — the rules file (CLAUDE.md / AGENTS.md), system instructions, tool definitions, environment context — and remove or relocate anything non-deterministic:

1. **Timestamps and dates.** Drop `Session started: 2026-08-10T10:30:00Z` and "current date/time" lines from the rules file and system instructions. If the agent needs the date, put it in a user message, not the cached prefix.[^codex-cache-hits]
2. **UUIDs, request IDs, run IDs, git SHAs, line counts.** Any auto-generated identifier injected into instructions or an AGENTS.md header changes per run — move it out. Auto-generated content (git line counts, generated timestamps) in a rules file is a common offender.[^codex-cache-hits]
3. **Version / build numbers on instructions.** If you stamp the rules file or config with a build number, every build invalidates the cache. Version it out-of-band.[^codex-cache-hits]
4. **Unsorted or non-deterministic JSON.** Tool definitions, MCP schemas, and config serialized with unstable key order (or a set/dict that isn't sorted) hash differently each time even when the content is the same. Serialize with sorted keys and a fixed field order so the bytes are stable.[^openai-caching]
5. **Non-deterministic tool ordering.** If tools or MCP servers are discovered and listed in filesystem/hash order, that order can shift between runs and invalidate the tools layer — which sits earliest in the prefix, so it takes everything after it down with it. Pin a deterministic order.[^codex-cache-hits][^anthropic-caching]

The general fix is the same everywhere — **static content first, variable content last** — because the cache always matches from the front.[^openai-caching][^gemini-caching] Where a tool exposes explicit breakpoints, place the last one on the last block that is identical across requests, and keep the per-request bits behind it. See this technique's row in `TOOL_MATRIX.md` for which tools expose a breakpoint knob and which manage placement for you.

## When it's worth it / when not

- **Worth it:** when your cache-read share is lower than it should be for a repetitive session — a strong sign something in the prefix is churning. One dynamic line can cost you the read discount on the entire prefix behind it, every turn.
- **Worth it:** anywhere you author the prefix (rules files, custom system instructions, MCP/tool configs) — that's where invalidators sneak in.
- **Not worth it:** if you're already seeing high cache-read ratios, the prefix is stable; don't chase phantom invalidators. Verify first.
- **Careful:** don't strip content the agent actually needs (e.g. the real current date for a time-sensitive task). The fix is to *relocate* it past the breakpoint, not delete it.

## What it costs you

- **Setup effort is Medium.** Finding the invalidator means reading what your tool actually sends and correlating a low cache-read ratio to a specific churning line — not a one-flag change.
- **Quality risk is Low.** You're changing where content lives, not what the agent knows. The one failure mode is removing something the prefix genuinely needed instead of moving it after the breakpoint.
- **It can recur.** A later edit — someone adds a timestamp back to CLAUDE.md, a new MCP server serializes config unsorted — silently reintroduces the miss. Treat prefix stability as something to re-check when the rules file or tool set changes, not a one-time fix.
- **Managed tools give you less control.** For IDE/CLI tools that manage caching themselves, you can only fix the content you author (rules file, instructions, config); you can't move a provider-placed breakpoint. That's usually enough, because the invalidators that bite are in the content you wrote.

## How to verify

- **Watch the cache-read vs cache-write split.** In Claude Code, `cache_read_input_tokens` should dominate `cache_creation_input_tokens` on repeat turns of a stable session; a persistent spike of *creation* (or a `/usage` "cache miss" flag) means the prefix is churning.[^cc-prompt-caching] `ccusage` and the OpenTelemetry exporter surface the same split per session.
- **Bisect the prefix.** Once you see chronic misses, diff what the tool sends on two consecutive identical-looking requests; the first differing byte is your invalidator. In Aider, run `--no-stream` so cache stats and costs actually show up.[^aider-caching]
- **Confirm the fix.** After removing/relocating the offender, the same repeated session should flip to mostly cache reads and the per-turn input cost should drop toward the 0.1x read rate for the cached portion.[^cache-econ]

## Measured impact

_Not yet measured by us._ Benchmark: take a repetitive multi-turn task on one repo, plant a single silent invalidator in the prefix (a per-turn timestamp line in the rules file) as the baseline, then run the same task with it removed, and compare the cache-read share and input cost per turn. The expected signal is the baseline showing near-100% cache *creation* on every turn (full re-process at the write rate) flipping to mostly cache *reads* (0.1x input) once the invalidator is gone.[^cache-econ] Cited so far: a Codex practitioner documents timestamps in system prompts, randomized tool ordering, and auto-generated content in AGENTS.md as patterns that "destroy cache hits."[^codex-cache-hits] ⚠ Practitioner data; the size of the effect depends entirely on how large the invalidated prefix is and how often it repeats — not independently benchmarked by us.

[^anthropic-caching]: Claude API docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^openai-caching]: OpenAI API docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^gemini-caching]: Gemini API docs, "Context caching" — <https://ai.google.dev/gemini-api/docs/caching>
[^codex-cache-hits]: Codex Knowledge Base (Daniel Vaughan), "Prompt caching in Codex CLI: how to maximise cache hits" — <https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/>
[^cc-prompt-caching]: Claude Code docs, "How Claude Code uses prompt caching" — <https://code.claude.com/docs/en/prompt-caching>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
[^cache-econ]: Claude API pricing — <https://platform.claude.com/docs/en/about-claude/pricing>
