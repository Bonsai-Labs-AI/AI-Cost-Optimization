---
title: "Stable tool/MCP order; don't switch models mid-session"
group: caching
level: 2
costLever: [cache]
effort: Low
savingEstimate: "varies — avoids a full-prefix re-charge on each break"
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
  - "caching/keep-cache-warm"
  - "context/keep-rules-file-small"
sources:
  - id: cc-prompt-caching
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache prefix is tools -> system -> messages, in that order, up to the cache_control block. Changing tool definitions invalidates the entire cache; a change at any level invalidates that level and all levels after it."
  - id: anthropic-skills-caching
    title: "Prompt caching (claude-api skill)"
    publisher: "anthropics/skills"
    url: "https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md"
    accessed: "2026-08-10"
    kind: repo
    note: "\"Tools render at position 0; adding, removing, or reordering a tool invalidates the entire cache.\" \"Same for switching models (caches are model-scoped).\" \"Model switch has no escape hatch.\""
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache miss reprocesses full context; TTL is 1 hr on subscription, 5 min on usage credits or API/cloud; ENABLE_PROMPT_CACHING_1H=1 keeps 1 hr on credits. /usage flags cache misses at >=10% of recent usage."
  - id: cc-mcp
    title: "Connect Claude Code to tools via MCP"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/mcp"
    accessed: "2026-08-10"
    kind: docs
    note: "claude mcp add / remove / list; /mcp panel enables/disables servers; MCP tool definitions are deferred by default (only names load until a tool is used)."
  - id: aider-caching
    title: "Prompt caching"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/caching.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--cache-prompts enables caching; --cache-keepalive-pings pings every 5 min to hold the cache."
---

## What & why

Prompt caching charges the first pass over a prefix at the write rate and every later pass at ~0.1x, but only if the prefix matches byte-for-byte. The provider builds that prefix in a fixed order — `tools`, then `system`, then `messages` — so your tool and MCP definitions sit at position 0, in front of everything.[^cc-prompt-caching][^anthropic-skills-caching] Adding, removing, or reordering a tool (or toggling an MCP server, which changes the tool set) rewrites position 0 and invalidates the **entire** cache, including the system prompt and the whole conversation behind it. Caches are also model-scoped, so switching models mid-session re-pays the full prefix with no way to keep the old cache.[^anthropic-skills-caching] The lever is cache hits: keep the front of the prefix frozen and you keep reading it at the cached rate instead of re-writing it.

## How to do it

The portable rule is: **freeze position 0 for the life of a session.**

1. **Fix the tool/MCP set before you start.** Decide which MCP servers and tools you need for the task, enable exactly those, and leave the set alone. Enabling or disabling a server mid-session changes the tool list and invalidates the cache from the front.[^anthropic-skills-caching][^cc-mcp]
2. **Don't reorder tools.** Order matters as much as membership — a reordered tool list is a different prefix. If your config or a script assembles the tool list, keep the order deterministic across turns.
3. **Pick the model up front and stay on it.** Because caches are model-scoped, a mid-session `/model` switch throws away the cache and reprocesses the whole context on the next turn. If you want a cheap-then-strong split, do it at task boundaries (clear or start a new session), not inside a warm session.[^anthropic-skills-caching]
4. **Keep the rest of position 0–1 stable too.** The same prefix-match rule means volatile content injected ahead of the conversation (a live date, a changing "mode" line in the system prompt) invalidates everything downstream; keep the system prompt frozen as well.[^cc-prompt-caching]

For managed IDE tools (Cursor, Copilot, Grok Build) caching is provider-side, so there's no cache flag to set — the discipline is the same (don't churn the MCP set, don't swap the model mid-task), you just can't tune the cache directly. CLI tools that expose caching explicitly (e.g. Aider's `--cache-prompts`, plus `--cache-keepalive-pings` to hold the cache warm) give you a direct knob instead.[^aider-caching] See this technique's row in `TOOL_MATRIX.md` for the exact per-tool knob or `(managed)` marker.

## When it's worth it / when not

- **Worth it:** any long, warm session against a provider that caches (Claude, and increasingly others) — which is the normal agentic-coding loop. The longer and more expensive the prefix, the more a needless invalidation costs.
- **Worth it most:** sessions with large tool/MCP surfaces and long histories, where re-writing the whole prefix is a big charge.
- **Not the point:** if you genuinely need a different tool or a stronger model, add it — a correct answer beats a cache hit. The rule is "don't churn the tool set or model *casually* mid-session," not "never change anything." When you do need the change, take it at a clean boundary so you only pay the re-write once.
- **Doesn't apply** where there's no prefix cache to lose (e.g. a provider or path with caching off).

## What it costs you

- **Almost no quality risk.** You're constraining *when* you change tools/models, not *whether*. The only failure mode is under-provisioning — starting without a tool you turn out to need, then adding it mid-session and eating one invalidation. Mitigate by choosing the tool set deliberately up front.
- **Mild friction.** "Set the model and MCP set before you start" is a habit, not a setting. On managed tools you can't enforce it in config; it's a team convention.
- **Watch the hidden churn.** Auto-reconnecting MCP servers, a flaky server that drops and re-registers, or config that reorders tools between turns will each invalidate the cache without you touching anything. If cache-miss rate is high with no obvious cause, check for a tool list that isn't stable turn-to-turn.

## How to verify

- **Cache-read vs cache-write share.** On a warm session, later turns should be dominated by cache *reads*, not writes. In Claude Code, `/usage` flags cache misses when they exceed ~10% of recent usage;[^cc-costs] the per-model line in `/cost`-style output shows `cache read` vs `cache write` token counts.
- **Watch for a full-prefix re-write right after a tool/MCP/model change.** A spike in cache-write tokens immediately after you toggled a server or switched models is the invalidation you're trying to avoid.
- **OTel / ccusage** expose token usage split into `cacheRead` / `cacheCreation`, so you can chart write spikes against the moments you changed the tool set.

## Measured impact

_Not yet measured by us._ Benchmark: run the same task twice in one warm session — a baseline that keeps the tool/MCP set and model fixed, versus a variant that toggles an MCP server (or switches models) partway through — and compare cache-write vs cache-read tokens and total cost per passing task. The mechanism is documented rather than estimated: a tool-definition change or a model switch invalidates the entire cached prefix, so the variant re-pays the full write on the next turn instead of reading at ~0.1x.[^cc-prompt-caching][^anthropic-skills-caching] ⚠ The size of the saving depends on prefix size and session length and is not yet independently quantified for a coding workload.

[^cc-prompt-caching]: Claude Platform Docs, "Prompt caching" — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^anthropic-skills-caching]: anthropics/skills, "Prompt caching (claude-api skill)" — <https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/prompt-caching.md>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cc-mcp]: Claude Code docs, "Connect Claude Code to tools via MCP" — <https://code.claude.com/docs/en/mcp>
[^aider-caching]: Aider docs, "Prompt caching" — <https://aider.chat/docs/usage/caching.html>
