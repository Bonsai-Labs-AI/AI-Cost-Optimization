---
title: "Git checkpoints + revert"
group: workflow
level: 2
costLever: [turns, input]
effort: Low
savingEstimate: "varies — cuts rework turns"
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
  - "workflow/deterministic-orchestration"
  - "context/tool-output-filtering"
sources:
  - id: cc-checkpointing
    title: "Checkpointing"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/checkpointing"
    accessed: "2026-08-10"
    kind: docs
    note: "/rewind or Esc Esc; restore code / conversation / both. Does NOT track bash-command file changes, subagent edits, or external edits."
  - id: cursor-checkpoints
    title: "Checkpoints"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/agent/chat/checkpoints"
    accessed: "2026-08-10"
    kind: docs
    note: "Automatic per-turn snapshots; 'Restore Checkpoint' button in chat timeline. Local, separate from Git; manual edits not tracked; not version control."
  - id: cline-checkpoints
    title: "Checkpoints"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/core-workflows/checkpoints"
    accessed: "2026-08-10"
    kind: docs
    note: "Shadow git repo separate from project history. Restore Files / Restore Task Only / Restore Files & Task. Toggle via Enable Checkpoints."
  - id: aider-git
    title: "Git integration"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/git.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Auto-commits each edit; dirty-commit before editing; /undo reverts last aider commit. --no-auto-commits / --no-dirty-commits."
  - id: opencode-snapshots
    title: "Snapshots"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/v2/docs/snapshots"
    accessed: "2026-08-10"
    kind: docs
    note: "Snapshot per message via separate internal git object DB (no commits on your repo); /undo and /redo roll files + messages back."
  - id: vantage-agentic
    title: "The Hidden Cost Driver in Agentic Coding Sessions in 2026"
    publisher: "Vantage"
    url: "https://www.vantage.sh/blog/agentic-coding-costs"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Retry cycles re-pay the whole (inflated) context each round-trip; failed paths at turn 40 cost 3x a turn already carrying 30k+ input tokens."
  - id: cc-costs
    title: "Manage costs effectively"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Agent teams use ~7x the tokens of a standard session — a mess that fans out across teammates is expensive to reason over."
---

## What & why

When an agent breaks the tree — a bad edit, a half-applied refactor, a wrong turn it keeps
patching — the cheapest fix is usually to throw the mess away, not to reason over it. Commit or
checkpoint before a risky change, and if it goes wrong, revert to the clean state and re-prompt.
This pulls the **turns** lever (and the **input** lever with it): you stop paying for retry cycles
that re-send an ever-growing, broken context on every round-trip.[^vantage-agentic]

## How to do it

The portable habit is three moves:

1. **Mark a clean point before risky work.** `git commit` (or `git stash`) when the tree is in a
   known-good state — before a large refactor, a dependency bump, or any change you're unsure the
   agent will get right. Most agents also keep their own automatic checkpoints per turn, so you
   often already have a restore point without doing anything.
2. **Revert instead of debugging the mess.** When the agent is clearly off track — repeated failed
   fixes, growing diff, tests still red — reset to the clean point (`git reset --hard` /
   `git checkout .`, or the tool's rewind/restore) rather than letting it read the broken tree and
   reason over it. Reasoning over a broken tree is the expensive path: each retry re-pays the whole
   inflated context.[^vantage-agentic]
3. **Re-prompt from clean, with a better instruction.** Start the next attempt from the good state
   with a sharper prompt (what went wrong, the constraint to respect). A clean second attempt is
   almost always cheaper than a long recovery from a wrong first one.

Prefer **git** as the durable checkpoint — it survives sessions, subagents, and bash-command side
effects. Treat the tool's built-in rewind as the fast, in-session undo layered on top. See this
technique's row in `TOOL_MATRIX.md` for each tool's exact rewind command and restore options.

## When it's worth it / when not

- **Worth it:** long or exploratory sessions; risky changes (refactors, migrations, dependency
  bumps); any point where the agent has visibly started patching its own mistakes. The bigger the
  accumulated context, the more a revert saves versus grinding on.[^vantage-agentic]
- **Worth it with agent teams:** a mess fanned out across several teammates is costly to untangle —
  agent teams run about **7x** the tokens of a standard session — so reverting to a clean point and
  re-launching is often far cheaper than reconciling the wreckage.[^cc-costs] ⚠
- **Not worth it:** when the agent is *close* and the remaining fix is small and well-understood —
  reverting there throws away good work and re-pays for the parts that were already right. Judge by
  whether the diff is converging or diverging.

## What it costs you

- **Discarded good work.** A revert is all-or-nothing back to the checkpoint; anything useful since
  then is lost unless you salvage it first. Mitigate by checkpointing at finer granularity.
- **A discipline cost, not a token cost.** The habit is committing (or checkpointing) *before* the
  risky step; forget it and you have nothing to revert to. Cheap to build once it's a reflex.
- **Rewind blind spots — know what your tool does NOT track.** Built-in checkpoints are not full
  version control. Claude Code's rewind ignores files changed by bash commands and most subagent
  edits;[^cc-checkpointing] Cursor's checkpoints are local, separate from Git, and don't track manual
  edits;[^cursor-checkpoints] Cline uses a shadow git repo scoped to files it touched;[^cline-checkpoints] OpenCode snapshots
  live in an internal git object database and don't commit to your repo.[^opencode-snapshots] Aider is the
  outlier — it commits every edit to real git and `/undo` reverts the last one, so its trail is
  durable by default.[^aider-git] For anything a rewind can't undo (a `rm`, a migration, a `mv`), you
  need a real git commit to fall back to — which is why git is the durable layer and rewind is the
  convenience layer.

## How to verify

- **Turns / cost per completed task.** Compare sessions where you revert-and-retry early against
  sessions where the agent keeps patching a broken tree. Watch turns-to-green and total cost per
  passing task; `ccusage` or Claude Code OTel show per-session tokens.
- **Input tokens on recovery stretches.** A long tail of high-input turns after a wrong turn is the
  signature of reasoning-over-a-mess; a revert should cut that tail short.[^vantage-agentic]

## Measured impact

_Not yet measured by us._ Benchmark: take a task where the agent reliably goes down a wrong path,
then compare two arms on the same repo — a baseline that lets the agent keep patching the broken
tree, versus a variant that reverts to the pre-change checkpoint and re-prompts from clean. Compare
turns-to-green, input tokens, and cost per passing task. Cited context, not a direct measurement of
this technique: practitioner analysis reports that failed retry cycles re-pay the full inflated
context each round-trip (e.g. three failed attempts at turn 40 costing 3x a turn already carrying
30k+ input tokens),[^vantage-agentic] and agent teams run ~7x the tokens of a standard session, so recovering
a fanned-out mess is expensive.[^cc-costs] ⚠ Both are practitioner/vendor figures, not independently
verified.

[^vantage-agentic]: Vantage, "The Hidden Cost Driver in Agentic Coding Sessions in 2026" — <https://www.vantage.sh/blog/agentic-coding-costs>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
[^cc-checkpointing]: Claude Code docs, "Checkpointing" — <https://code.claude.com/docs/en/checkpointing>
[^cursor-checkpoints]: Cursor docs, "Checkpoints" — <https://cursor.com/docs/agent/chat/checkpoints>
[^cline-checkpoints]: Cline docs, "Checkpoints" — <https://docs.cline.bot/core-workflows/checkpoints>
[^aider-git]: Aider docs, "Git integration" — <https://aider.chat/docs/git.html>
[^opencode-snapshots]: OpenCode docs, "Snapshots" — <https://opencode.ai/v2/docs/snapshots>
