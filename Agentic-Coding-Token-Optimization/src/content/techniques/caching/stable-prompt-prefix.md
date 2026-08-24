---
title: "Stable prompt prefix"
group: caching
level: 1
costLever: [cache]
effort: Low
savingEstimate: "large on long sessions"
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
  - gemini-cli
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "context/keep-rules-file-small"
sources:
  - id: claude-caching
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Prefix is a cumulative hash; changing any block at or before a breakpoint changes the hash and misses the cache. Cache order is tools → system → messages; a change at one level invalidates that level and all after it. Tool-definition change invalidates everything; tool_choice and images invalidate the message cache."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "A cache miss reprocesses full context; /usage flags cache-miss behavior at ≥10% of recent usage. Cache lifetime 1 hr subscription / 5 min usage-credits or API; ENABLE_PROMPT_CACHING_1H=1 keeps 1 hr on credits."
  - id: openai-caching
    title: "Prompt caching"
    publisher: "OpenAI API docs"
    url: "https://developers.openai.com/api/docs/guides/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Automatic, no code changes. Exact prefix match from the start. Keep instructions, tools, schemas, shared context stable; place request-specific content after the reusable prefix. Min 1,024 tokens."
  - id: gemini-implicit
    title: "Gemini 2.5 models now support implicit caching"
    publisher: "Google Developers Blog"
    url: "https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/"
    accessed: "2026-08-10"
    kind: blog
    note: "Implicit caching on by default for Gemini 2.5; keep the beginning of the request the same and add changing content at the end; 75% token discount on cache hits."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts caches the system prompt, read-only files, the repo map, and editable files; --cache-keepalive-pings N keeps it warm. Adding a /read-only file or a repo-map change moves the prefix."
---

## What & why

Prompt caching is a prefix match: the provider caches the prompt from the start up to a
breakpoint, and reuses it only if the bytes before that point are identical to a previous
request. Cached input reads at ~0.1× the base rate,[^cc-costs] so on a long session the stable
front of the prompt — the system prompt, tool definitions, rules file, and the settled part of
the conversation — should read cached on almost every turn. This technique is about not breaking
that prefix: any byte change before the cached point produces a different hash and misses the
cache, forcing the whole prefix to be reprocessed at full price.[^claude-caching] The lever is
cache hits.

## How to do it

Treat the front of the prompt as immutable during a session, and batch any change to it at a
session boundary (a `/clear`, a new session) instead of mid-flight.

The rules that hold across tools:

1. **Don't change the rules or config mid-session.** Editing `CLAUDE.md` / `AGENTS.md` /
   `.cursorrules`, toggling a tool or MCP server, or changing the system prompt rewrites content
   near the front of the prompt and invalidates every cached token after it. Make those edits
   between sessions, not during one.
2. **Don't switch model, tools, or thinking settings mid-task if you can help it.** Switching
   model with `/model`, enabling/disabling a tool, or changing `tool_choice` or images moves the
   prefix and drops the cache.[^claude-caching][^cc-costs] Decide the setup up front.
3. **Order the prompt static-first, variable-last.** The stable content — instructions, tool
   schemas, shared context — goes at the front; the per-request part (the user's message,
   timestamps, dynamic context) goes at the end. Every provider's guidance says the same: keep
   the prefix identical and let only the tail change.[^openai-caching][^gemini-implicit] A
   timestamp or session-specific value near the front silently defeats caching on every turn.
4. **Batch config changes at boundaries.** If you have several rules/config edits to make, apply
   them together and start a fresh session, so you pay one reprocess instead of one per edit.

Most of this is provider-managed for the IDE tools — Cursor, Copilot, and the managed IDEs add
the cache markers server-side, so there is no knob to set; your job is only to avoid churning the
prefix. Where a tool exposes an explicit control (Aider's `--cache-prompts`, which caches the system
prompt, read-only files, and the repo map; Cline's `cache_control` markers), it caches the
settled front and you keep it stable the same way — note that adding a `/read-only` file or
letting the repo map shift mid-session moves that prefix.[^aider-caching] See
this technique's row in `TOOL_MATRIX.md` for the per-tool control or `(managed)` note.

## When it's worth it / when not

- **Worth it:** always, and more so the longer the session and the larger the stable prefix (big
  rules file, many tool definitions, long settled history). Long sessions are where the cached
  prefix is largest and a miss costs the most.[^cc-costs]
- **Biggest wins:** long-running sessions on a large codebase where the front of the prompt is
  many thousands of tokens and stays put for hours.
- **Not a factor:** very short prompts below the provider's cache minimum (OpenAI caches only
  from ~1,024 tokens[^openai-caching]), or one-shot calls where nothing repeats.
- **Don't over-apply:** this is about *when* to change config, not *whether*. If a rule is wrong
  or missing, fix it — just do it at a session boundary rather than mid-task, and batch several
  fixes together.

## What it costs you

- **Almost no quality risk.** You are changing the timing of config edits, not the config itself.
- **A small workflow constraint:** you defer mid-session rule/tool tweaks to the next session.
  The failure mode is habit — editing the rules file or flipping a tool on a whim mid-task, each
  time paying a full-prefix reprocess. Once is cheap; every few turns adds up on a long session.
- **Watch for hidden prefix churn:** a timestamp, a "current file" line, or a per-request header
  injected near the front of the prompt breaks caching on every turn even though you never touched
  the config. That is the subtle one — the fix is to move the changing value to the end.[^openai-caching]

## How to verify

- Watch the **cache-read vs cache-write** split. On a healthy session most input tokens should be
  cache reads; a spike in cache-write (or plain uncached input) after a config change is the
  prefix breaking.
- In Claude Code, `/usage` flags **cache misses** as a behavior when they reach ≥10% of recent
  usage, and the per-model line in the cost summary shows `cache read` vs `cache write`
  tokens.[^cc-costs] `ccusage` and Claude Code OpenTelemetry expose the same `cacheRead` /
  `cacheCreation` split per session.
- Quick test: make one config edit mid-session and watch the next turn reprocess the whole prefix
  (large cache-write, little cache-read); that is the cost you are avoiding by batching.

## Measured impact

_Not yet measured by us._ Benchmark: run the same long task twice on one repo — a baseline that
edits the rules file / switches model / toggles a tool mid-session, versus the variant that keeps
the prefix stable and batches those changes at session boundaries — and compare cache-read share
and input cost per passing task. Cited so far: cached input reads at ~0.1× base rate, so a broken
prefix reprocesses the whole front at ~10× the cached price;[^cc-costs] providers' own caching
guidance confirms any change before the cached point misses the cache.[^claude-caching][^openai-caching] ⚠ These are
vendor-documented mechanics, not an independently measured coding-session number.

[^claude-caching]: Claude Platform Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^openai-caching]: OpenAI API docs, "Prompt caching" — <https://developers.openai.com/api/docs/guides/prompt-caching>
[^gemini-implicit]: Google Developers Blog, "Gemini 2.5 models now support implicit caching" — <https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
