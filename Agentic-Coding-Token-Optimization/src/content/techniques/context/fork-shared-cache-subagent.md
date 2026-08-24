---
title: "Fork / shared-cache subagent"
group: context
level: 3
costLever: [input, cache]
effort: Low
savingEstimate: "~90% of prefix input on the fan-out children"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - claude-code
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: cc-subagents
    title: "Create custom subagents (Fork subagents and fork mode)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/sub-agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Fork inherits parent system prompt/tools/model/history; first request reuses the parent's cache. CLAUDE_CODE_FORK_SUBAGENT=1/0; default on in interactive sessions from v2.1.232. /subtask (v2.1.212+), /fork on older builds. Deny with Agent(fork). isolation: worktree for isolated edits."
  - id: cc-prompt-caching
    title: "How Claude Code uses prompt caching (Subagents and the cache)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "cache_read_input_tokens billed at ~10% of standard input. A fresh subagent's first request doesn't read the parent's cache (different prefix) and uses 5-min TTL even on subscription; a fork's first request reads the parent's cache."
  - id: cc-workflows
    title: "Orchestrate subagents at scale (Prompt caching in a fan-out)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/workflows"
    accessed: "2026-08-10"
    kind: docs
    note: "In a fan-out of matching agents, Claude Code holds all but the first until the first response begins so the rest read the shared prefix. Capped by CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS (default 5000; 0 disables)."
  - id: systima-tax
    title: "The Subagent Tax: Claude Code fan-outs cost up to 5.9x the tokens"
    publisher: "Systima"
    url: "https://systima.ai/blog/subagent-tax"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Fable 5: sequential 166,459 metered input tokens vs two-subagent fan-out 974,987 (~5.9x). Practitioner measurement; a cold-spawned sibling missed the warm cache with a 40,829-token write. Does not test forks."
  - id: cc-costs
    title: "Manage costs (agent teams token multiple)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Agent teams use ~7x the tokens of a standard plan-mode session (each teammate is its own context window). Vendor self-reported."
---

## What & why

A subagent normally starts with a fresh context — its own system prompt, tools, and empty history — which keeps the parent's context clean but means its first request shares no prefix with the parent, so it re-processes a full baseline at the standard input rate. A **fork** instead inherits the parent's exact system prompt, tools, model, and conversation history, so its first request reads the parent's prompt cache — billed at roughly 10% of the standard input rate — rather than re-paying for that prefix.[^cc-subagents][^cc-prompt-caching] The lever is cache reuse across subagents: fork when several children need the *same* context, so children 2–N read a warm prefix instead of each writing their own.

## How to do it

The portable idea is to **match the prefix across the children you fan out**. Two agents that share a model, effort level, tools, and working directory build the same prefix, so if the second one starts after the first has begun responding, it reads the first's cache on its first request instead of processing it cold.[^cc-workflows] Fork is the strongest version of this: it copies the parent's context verbatim, so the child starts from an already-cached prefix.

Practical steps:

1. **Pick fork vs fresh by what the child needs.** If the child needs the situation the parent is already holding (same files, same plan, same conventions), fork it — you skip re-explaining and you reuse the cache. If the child needs a genuinely clean slate (a fresh-eyes review, a narrow lookup that shouldn't inherit the parent's assumptions), keep it fresh.
2. **Fan out same-context children together, not staggered by minutes.** The cache the first child warms is what the rest read; a sibling that starts cold after the warm prefix has expired misses and writes its own.
3. **Let the harness stagger the fan-out.** In a same-prefix fan-out the runtime briefly holds all but the first child so their first requests hit the shared prefix; that hold is bounded by a timeout you can tune.[^cc-workflows]

In Claude Code specifically, fork mode is a session mode (`CLAUDE_CODE_FORK_SUBAGENT`), forks are started with `/subtask` (or `/fork` on older builds), and you can pass isolated file edits through a worktree. This is a Claude-Code-first capability today: other harnesses have subagents, but they start children with their own/blank context rather than sharing the parent's cached prefix. See this technique's row in `TOOL_MATRIX.md` for the exact per-tool state.

## When it's worth it / when not

- **Worth it:** same-context fan-out — several children that all need the parent's current situation (parallel edits across a plan, a batch of same-shape lookups, drafting from one shared brief). The bigger the shared prefix and the more children, the more the cache reuse pays.
- **Worth it:** handing a side task without re-explaining — a fork sees the whole conversation, so you don't re-pay to rebuild context you already have.
- **Not worth it:** when the child genuinely benefits from a clean slate. A fork inherits the parent's framing, which can bias a review or carry along context the child doesn't need. For fresh-eyes work, the isolation of a fresh subagent is the point.
- **Not worth it:** one-off children where there's no shared prefix to reuse — the fork's only saving is the cache read, and there's nothing to read.

## What it costs you

- **Quality risk from inherited framing.** The main reason to keep a subagent fresh is context isolation — a reviewer that didn't see the implementer's reasoning catches more. Forking trades that away. Use fresh subagents where independence matters and reserve forks for same-context fan-out.
- **Fan-outs are still expensive in absolute terms.** Cache reuse cuts the *prefix* cost, not the number of agents. Multi-agent work runs well above a single session regardless — agent teams use on the order of 7x the tokens of a standard plan-mode session, since each teammate is its own context window.[^cc-costs] Fork lowers the per-child prefix bill; it doesn't make fan-out cheap.
- **Cache-miss cliffs.** The saving depends on the sibling reading a *warm* prefix. A child that starts after the prefix's TTL has lapsed, or after a cache-invalidating change (model switch, effort change, tool-set change), misses and writes its own — re-paying exactly what you meant to save. Keep same-prefix children close together in time and don't change the model or effort mid-fan-out.
- **Setup effort is low.** In Claude Code it's a session mode plus a command, not a build step.

## How to verify

- Watch `cache_read_input_tokens` vs `cache_creation_input_tokens` on the children's first requests. A fork (or a well-staggered sibling) should show a high read count on turn one; a cold fresh subagent shows creation instead. A statusline script or the OpenTelemetry exporter surfaces both per session.[^cc-prompt-caching]
- Compare input tokens and cost per passing task for the same fan-out run fork vs fresh. If children share a large prefix, the fork run's input tokens should drop sharply on children 2–N.
- If you expect reuse but see creation, check for a cache-invalidating change between children (model/effort switch, tool-set change) or a gap longer than the TTL.

## Measured impact

_Not yet measured by us._ Benchmark: run the same same-context fan-out task on one repo two ways — children spawned fresh (each re-pays its prefix) vs children forked from the parent (each reads the parent's cached prefix) — and compare input tokens and cost per passing task. The expected signal is a large drop in `cache_creation` and a rise in `cache_read` on the forked children's first requests. Cited so far: a practitioner measured a two-subagent fresh fan-out at ~5.9x the metered input tokens of the sequential baseline on Fable 5 (166,459 → 974,987 input tokens), with a cold-spawned sibling missing the warm cache on a ~40.8k-token write; the same post does not test forks.[^systima-tax] ⚠ Practitioner data, single harness/run, not independently verified. Anthropic's own ~7x agent-teams multiple is vendor self-reported.[^cc-costs]

[^cc-subagents]: Claude Code docs, "Create custom subagents" (fork subagents and fork mode) — <https://code.claude.com/docs/en/sub-agents>
[^cc-prompt-caching]: Claude Code docs, "How Claude Code uses prompt caching" (subagents and the cache) — <https://code.claude.com/docs/en/prompt-caching>
[^cc-workflows]: Claude Code docs, "Orchestrate subagents at scale" (prompt caching in a fan-out) — <https://code.claude.com/docs/en/workflows>
[^systima-tax]: Systima, "The Subagent Tax: Claude Code fan-outs cost up to 5.9x the tokens" — <https://systima.ai/blog/subagent-tax>
[^cc-costs]: Claude Code docs, "Manage costs" — <https://code.claude.com/docs/en/costs>
