---
title: "Org-shared prompt cache"
group: caching
level: 2
costLever: [cache]
effort: Medium
savingEstimate: "varies — a team-wide lift on cache-hit rate"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - codex
  - aider
  - cline
  - cursor
  - copilot
  - opencode
  - grok-build
status: researched
lastUpdated: "2026-08-10"
related:
  - "caching/keep-cache-warm"
  - "context/keep-rules-file-small"
sources:
  - id: api-caching
    title: "Prompt caching"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Cache storage and sharing: caches isolated between organizations, and per workspace on Claude API / Claude Platform on AWS / Microsoft Foundry; Bedrock and Google Cloud use org-level isolation only. Read 0.1x, 5-min write 1.25x, 1-hr write 2x."
  - id: cc-caching
    title: "How Claude Code uses prompt caching"
    publisher: "Claude Code Docs"
    url: "https://code.claude.com/docs/en/prompt-caching"
    accessed: "2026-08-10"
    kind: docs
    note: "Exact prefix match; system-prompt / project-context / conversation layers ordered least-changing first. Cache scope: 'In Claude Code, the cache is effectively scoped to one machine and directory' because the system prompt embeds working dir, platform, shell, OS version, auto memory paths. 'The underlying API cache is broader ... any two requests with the same model and prefix read the same cache.'"
  - id: cc-sysprompt
    title: "Modifying system prompts — Improve prompt caching across users and machines"
    publisher: "Claude Code Docs (Agent SDK)"
    url: "https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts"
    accessed: "2026-08-10"
    kind: docs
    note: "excludeDynamicSections: true / exclude_dynamic_sections: True moves per-session context into the first user message so identical configs share a cache entry across users and machines. Requires TS SDK v0.2.98+ / Python v0.1.58+."
  - id: cc-cli
    title: "CLI reference — --exclude-dynamic-system-prompt-sections"
    publisher: "Claude Code Docs"
    url: "https://code.claude.com/docs/en/cli-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "Flag moves working directory / environment info / memory paths / git-repo flag out of the system prompt into the first user message; 'Use with -p for scripted, multi-user workloads.'"
  - id: codex-caching
    title: "Prompt Caching in Codex CLI: How the Agent Loop Stays Linear and How to Maximise Cache Hits"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex keeps system instructions, tool definitions, sandbox config and environment context identical and consistently ordered to preserve a long stable prefix; automatic exact-prefix caching. Practitioner-sourced."
---

## What & why

Prompt caching bills a re-read of an already-processed prefix at ~0.1x the input rate.[^api-caching] On
Anthropic, that cache is scoped to the **organization** (and, on some providers, the workspace) — not to
the individual API key or dev — so *any two requests with the same model and prefix read the same
cache*.[^cc-caching] The lever here is a team one: when developers' prompts start byte-identical
(same rules file, same tool set, same model, same ordering), their requests share cache entries instead of
each warming a private copy, and cache-hit rate rises across the whole team on a consolidated org. This is
the team-level payoff of the config-governance work — you standardize the prefix once and everyone benefits.

## How to do it

The cache keys on an **exact prefix match**: a change anywhere before a point recomputes everything after
it.[^cc-caching] Sharing a cache across the team therefore means making the front of every dev's request
identical. Two parts:

1. **Standardize the prefix inputs.** Agree on one project rules file (CLAUDE.md / AGENTS.md), one tool set
   in one order, one default model and effort level, and check them into the repo so every dev loads the
   same bytes. In Claude Code the low-churn layers are the system prompt (tool definitions, output style)
   and project context (CLAUDE.md, memory); keep them stable and identical, and avoid mid-session model or
   effort switches, which each start a fresh cache.[^cc-caching] This is the same discipline Codex's own
   loop uses — identical, consistently ordered system instructions and tool definitions to preserve a long
   stable prefix.[^codex-caching]

2. **Remove the per-machine noise that breaks byte-identity.** Here is the catch worth knowing: in ordinary
   interactive Claude Code the cache is *effectively scoped to one machine and directory*, because the
   system prompt embeds the working directory, platform, shell, OS version, and auto-memory paths — so two
   devs on different machines miss each other's cache even with an identical CLAUDE.md.[^cc-caching] For
   **scripted, multi-user workloads** (CI fixers, fleets of automated agents), strip those dynamic sections
   so the system prompt is identical everywhere: `claude -p --exclude-dynamic-system-prompt-sections`,[^cc-cli]
   or the Agent SDK's `excludeDynamicSections: true` / `exclude_dynamic_sections: True`.[^cc-sysprompt] The
   per-session context still reaches the model, but as part of the first user message rather than the system
   prompt, so identical configurations share one cache entry across users and machines.[^cc-sysprompt]

Route the team through one organization/workspace so there is a single cache to share — a split across
orgs or workspaces means a split cache with no overlap.[^api-caching] See this technique's row in
`TOOL_MATRIX.md` for the exact per-tool knob.

## When it's worth it / when not

- **Worth it:** larger teams on a consolidated Anthropic org running similar work — many devs on the same
  repo, or a fleet of automated agents (CI, PR triage) that all start from the same config. The more
  requests share a prefix, the more the shared cache pays back.
- **Worth it:** as the team-level reason to finish the config-governance work you'd do anyway (one rules
  file, one model policy). The cache lift is a second payoff on top of consistency.
- **Not worth it as its own project** on a tiny team, or where each dev genuinely needs a different model,
  tool set, or rules file — you can't share a prefix that isn't shared.
- **Interactive-only teams** get most of the value automatically once configs match and devs work in the
  same repo directory; the `--exclude-dynamic-system-prompt-sections` step only matters for scripted or
  cross-machine automation.[^cc-cli]

## What it costs you

- **Quality risk is low but real for the dynamic-sections flag.** Moving the working directory and
  auto-memory paths into the first user message means Claude weighs them slightly less than if they were in
  the system prompt, so it may reason a touch less firmly about the current directory.[^cc-sysprompt] Enable
  it only where cross-machine cache reuse matters more than maximally authoritative environment context —
  i.e. scripted fleets, not a developer's interactive session.
- **Setup effort is governance, not code:** getting a team to agree on and adopt one rules file, model
  policy, and tool order. That is the harder part, and it is work you should be doing for consistency
  regardless.
- **Version drift is the failure mode.** A Claude Code upgrade, a new tool, or an edited CLAUDE.md changes
  the prefix and rebuilds the cache from that point;[^cc-caching] with a shared cache, an unpinned upgrade
  rippling across the team briefly de-syncs everyone. Pin versions and roll config changes deliberately.
- **The SDK flag needs a recent version** (TS SDK v0.2.98+, Python v0.1.58+) and applies only to the preset
  system prompt, not a custom string.[^cc-sysprompt]

## How to verify

- Watch **cache-read vs cache-creation tokens**. Claude Code reports `cache_read_input_tokens` and
  `cache_creation_input_tokens` on every turn; a high read-to-creation ratio means the cache is working,
  and creation that stays high means the prefix keeps changing.[^cc-caching]
- For a **team view**, the Claude Code OpenTelemetry exporter reports cache read and creation tokens per
  user and session, so you can see hit rate rise across the org after standardizing configs.[^cc-caching]
- The signal that org-sharing specifically is landing: a dev's *first* request of the day on a
  standardized, multi-user setup reads from cache (low creation) rather than warming a fresh prefix.

## Measured impact

_Not yet measured by us._ Benchmark: run the same task from several simulated developers on one org —
baseline (each dev with a slightly different rules file / tool order / model) versus the variant applying
this technique (one standardized, byte-identical prefix, dynamic sections excluded for the scripted runs) —
and compare team-wide cache-hit rate and total cache-write tokens. Cited so far: Anthropic documents that
requests with the same model and prefix share the org/workspace cache and that excluding dynamic sections
lets identical configs share a cache across users and machines;[^cc-caching][^cc-sysprompt] Codex's loop
reports the same principle (a preserved stable prefix drives 80–90% cache-hit rates in typical
sessions).[^codex-caching] ⚠ The Codex hit-rate figures are practitioner-sourced, and the team-wide lift on
a consolidated org is not yet independently measured.

[^api-caching]: Claude Platform Docs, "Prompt caching" (Cache storage and sharing; pricing multipliers) — <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
[^cc-caching]: Claude Code Docs, "How Claude Code uses prompt caching" (Cache scope; actions that invalidate the cache; check cache performance) — <https://code.claude.com/docs/en/prompt-caching>
[^cc-sysprompt]: Claude Code Docs, "Modifying system prompts — Improve prompt caching across users and machines" — <https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts>
[^cc-cli]: Claude Code Docs, "CLI reference — `--exclude-dynamic-system-prompt-sections`" — <https://code.claude.com/docs/en/cli-reference>
[^codex-caching]: Codex Knowledge Base (Daniel Vaughan), "Prompt Caching in Codex CLI: How the Agent Loop Stays Linear and How to Maximise Cache Hits" — <https://codex.danielvaughan.com/2026/04/21/codex-cli-prompt-caching-maximise-cache-hits-cost-reduction/>
