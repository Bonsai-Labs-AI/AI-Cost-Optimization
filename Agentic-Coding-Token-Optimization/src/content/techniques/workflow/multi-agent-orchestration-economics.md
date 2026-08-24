---
title: "Multi-agent orchestration economics"
group: workflow
level: 3
costLever: [input, output]
effort: Low
savingEstimate: "avoid a ~7x multiple on the wrong work"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - codex
  - opencode
  - copilot
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/fork-shared-cache-subagent"
  - "context/explorer-subagent"
  - "workflow/loop-guardrails"
sources:
  - id: cc-costs
    title: "Manage costs (agent team token costs)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Agent teams use ~7x more tokens than standard sessions when teammates run in plan mode; each teammate is its own context window / separate instance. Vendor self-reported. Also: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to enable; keep teams small; shut teammates down when done."
  - id: cc-subagents
    title: "Create custom subagents"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/sub-agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Subagents defined in .claude/agents/*.md (model:, tools:); CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS default 20; each subagent runs in its own context window."
  - id: aicosts-explosion
    title: "The Claude Code Subagent Cost Explosion: 887K tokens/min"
    publisher: "AICosts.ai"
    url: "https://www.aicosts.ai/blog/claude-code-subagent-cost-explosion-887k-tokens-minute-crisis"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Practitioner cautionary figures: financial-services team ~$47k over 3 days from 23 subagents left running; a 49-subagent TypeScript run at 887k tokens/min for 2.5 hrs, estimated $8k-$15k. Both practitioner-reported, not independently verified."
  - id: systima-tax
    title: "The Subagent Tax: Claude Code fan-outs cost up to 5.9x the tokens"
    publisher: "Systima"
    url: "https://systima.ai/blog/subagent-tax"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Fable 5: sequential 166,459 metered input tokens vs two-subagent fan-out 974,987 (~5.9x); the fan-out was not faster. Practitioner measurement, single harness/run."
  - id: codex-subagents
    title: "Subagents"
    publisher: "OpenAI Codex docs"
    url: "https://learn.chatgpt.com/docs/agent-configuration/subagents"
    accessed: "2026-08-10"
    kind: docs
    note: "Subagents in .codex/agents/*.toml (name/description/developer_instructions; optional model, model_reasoning_effort); run in parallel; agents.max_concurrent_threads_per_session caps concurrency in config.toml."
  - id: opencode-agents
    title: "Agents"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/agents/"
    accessed: "2026-08-10"
    kind: docs
    note: "mode: subagent in opencode.json or agent markdown; invoked via the Task tool or @mention; each session is its own process so subagents run in parallel."
  - id: cursor-agents
    title: "Cursor 2026 breakdown: agent loop, models, pricing"
    publisher: "ChatGPT AI Hub"
    url: "https://chatgptaihub.com/what-s-new-in-cursor-2026-full-breakdown-for-developers/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Cursor background agents run in a Cursor-hosted sandbox and can be fired off in parallel, each in its own context; background agents bill per compute-minute on top of model token costs. Secondary source, verify against Cursor docs."
---

## What & why

A multi-agent team (agent teams, an orchestrator spawning subagents, or several parallel background
agents) is not one session doing more work — it is several sessions running at once, and **each agent
carries its own context window**. That is the whole cost story: the rules file, the repo context, the
tool listings, and the reasoning are paid for once per agent, not once for the job. Claude Code's own
docs put a standard agent team at **roughly 7x the tokens of a single plan-mode session**, because each
teammate is a separate instance with its own window.[^cc-costs] So multi-agent orchestration is a lever
that mostly pulls the wrong way — it *raises* total tokens — and the discipline is knowing the narrow
cases where the parallel speed-up is worth paying ~7x, and defaulting to a single agent everywhere else.

## How to do it

The rule of thumb: **fan out only for work that is genuinely parallel and read-heavy; keep sequential or
tightly-coupled work on a single agent.** Parallel *reads* (each agent explores a different area and
reports back) compose cleanly; parallel *writes* to the same code create merge conflicts, duplicated
reasoning, and re-work that costs more than it saved.

1. **Default to one agent.** A single session is the baseline. Reach for a team only when you can name a
   concrete reason the work is parallelizable — not because "more agents feels faster."
2. **Use it for independent, read-heavy fan-out.** The clean wins are jobs that split into
   non-overlapping, mostly-read units: a PR review where each agent covers a different concern, a bug
   investigation where each agent chases a different hypothesis across different files, a multi-area
   codebase survey. Each agent reads its slice and returns a summary; nothing steps on anything else.
3. **Keep coupled or sequential work single-agent.** If step B needs step A's result, or several agents
   would edit the same files, a team just multiplies context windows while serializing anyway. One agent
   (optionally forking to share the cached prefix — see [context/fork-shared-cache-subagent](../context/fork-shared-cache-subagent.md))
   is cheaper and avoids conflicts.
4. **Bound the fan-out and shut agents down.** Cap concurrency, keep each spawn prompt tight (every agent
   re-loads the rules file, MCP servers, and skills into its own window), and stop teammates the moment
   their work is done — an idle teammate keeps consuming tokens until it exits.[^cc-costs] Prefer a cheaper
   model (e.g. Sonnet, not Opus) for coordination-heavy teammates.
5. **Never leave a team running unattended.** The reported blow-ups are all unattended runs — agents that
   kept "improving" code with no human in the loop.[^aicosts-explosion] Treat a multi-agent run like a
   metered job: watch it, or gate it behind a budget.

The exact enablement flag and concurrency knob differ per tool — Claude Code gates agent teams behind an
experimental env var and caps concurrent subagents, each in its own context window;[^cc-subagents] Codex
and OpenCode both define subagents in per-agent config files and run them in parallel with their own
concurrency settings.[^codex-subagents][^opencode-agents] Aider and Grok Build have no in-session fan-out
at all. See this technique's row in `TOOL_MATRIX.md` for the exact per-tool mechanism.

## When it's worth it / when not

- **Worth it:** parallel *reads* with independent units — PR review split by concern, parallel bug
  investigation (one hypothesis per agent), a wide codebase survey. The speed-up is real and the units
  don't collide.
- **Worth it:** when wall-clock latency genuinely matters and the ~7x token premium is an acceptable
  trade for finishing in a fraction of the time — a deliberate, priced decision, not a default.
- **Not worth it:** sequential or coupled work (step B depends on A), or parallel *writes* to the same
  code. You pay N context windows and still serialize, or you pay for merge/re-work on top.
- **Not worth it:** anything unattended. The ~$47k and $8k-$15k figures below are all "left it running"
  stories, not fundamentally hard problems.[^aicosts-explosion]
- **Not worth it as a reflex.** "Spin up a team" is not a performance win by default; on at least one
  measured fan-out it was ~5.9x the tokens **and not faster** than the sequential baseline.[^systima-tax]

## What it costs you

- **The headline cost is total tokens.** A team is ~7x a single session because each agent re-pays for its
  own context window.[^cc-costs] This is the canonical ~7x number for the whole playbook; every other
  cost here is on top of it.
- **Unattended runaway.** Practitioner reports: a financial-services team spent **~$47,000 over three
  days** after 23 subagents kept analyzing code with no human involved; a **49-subagent** TypeScript run
  hit **887,000 tokens/minute** for 2.5 hours at an estimated **$8,000-$15,000** for the single
  session.[^aicosts-explosion] ⚠ Both are practitioner-reported and not independently verified — treat as
  cautionary illustrations of the failure mode, not benchmarks.
- **Duplicated setup per agent.** Every teammate loads the rules file, MCP definitions, and skills into
  its own window on spawn, so a bloated `CLAUDE.md` or a heavy MCP setup is multiplied by the team size.
- **Compute-minute billing on some tools.** Cursor's background agents bill per compute-minute on top of
  tokens, so parallel agents cost on two axes at once.[^cursor-agents] ⚠ Secondary source.
- **Coordination and merge overhead.** Parallel writers produce conflicts and overlapping reasoning that a
  human then has to reconcile — real engineering time, not just tokens.
- **Setup effort is low; the risk is judgment.** Enabling a team is a flag or a slash command. The cost is
  reaching for it on work that shouldn't be parallel.

## How to verify

- **Compare total tokens (and cost) for the whole job, team vs single agent** — not per-agent. The
  question is whether the parallel run's total is worth the wall-clock saved; if the team wasn't faster,
  it was pure loss.[^systima-tax]
- **Watch concurrent-agent count and per-teammate token rate** during a run. In Claude Code, `/usage`
  attributes recent usage to subagents as a share of the total;[^cc-costs] a runaway shows as a small
  number of agents dominating the bill.
- **Confirm teammates exit** when their work is done — an idle-but-alive teammate keeps drawing
  tokens.[^cc-costs]
- **Gate unattended runs behind a spend cap** (gateway budget or workspace limit) so a fan-out can't
  silently reach the numbers above.

## Measured impact

_Not yet measured by us._ Benchmark: take one read-heavy, parallelizable task (e.g. a multi-concern PR
review, or a bug hunt across several modules) and run it two ways on the same repo — a single-agent
baseline vs the same work fanned out to a multi-agent team — and compare total tokens, cost per resolved
task, and wall-clock time. The expected signal is a large rise in total tokens (on the order of the ~7x
Claude Code cites) against some wall-clock reduction; the technique "pays" only when that reduction is
worth the token premium and the work was genuinely parallel. Cited so far: Claude Code's docs put agent
teams at **~7x** the tokens of a standard plan-mode session;[^cc-costs] a practitioner measured a
two-subagent fan-out at **~5.9x** the sequential input tokens and no faster;[^systima-tax] and unattended
runs have been reported at **~$47k / 3 days** and **$8k-$15k / session**.[^aicosts-explosion] ⚠ The 7x is
vendor self-reported; the 5.9x, $47k, and $8k-$15k are practitioner blogs, not independently verified.

[^cc-costs]: Claude Code docs, "Manage costs" (agent team token costs) — <https://code.claude.com/docs/en/costs>
[^cc-subagents]: Claude Code docs, "Create custom subagents" — <https://code.claude.com/docs/en/sub-agents>
[^aicosts-explosion]: AICosts.ai, "The Claude Code Subagent Cost Explosion: 887K tokens/min" — <https://www.aicosts.ai/blog/claude-code-subagent-cost-explosion-887k-tokens-minute-crisis>
[^systima-tax]: Systima, "The Subagent Tax: Claude Code fan-outs cost up to 5.9x the tokens" — <https://systima.ai/blog/subagent-tax>
[^codex-subagents]: OpenAI Codex docs, "Subagents" — <https://learn.chatgpt.com/docs/agent-configuration/subagents>
[^opencode-agents]: OpenCode docs, "Agents" — <https://opencode.ai/docs/agents/>
[^cursor-agents]: ChatGPT AI Hub, "Cursor 2026 breakdown: agent loop, models, pricing" — <https://chatgptaihub.com/what-s-new-in-cursor-2026-full-breakdown-for-developers/>
