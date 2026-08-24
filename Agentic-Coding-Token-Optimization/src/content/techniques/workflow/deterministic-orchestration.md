---
title: "Deterministic orchestration instead of LLM coordination"
group: workflow
level: 2
costLever: [turns, calls, input]
effort: Medium
savingEstimate: "large on coordination-heavy workflows (one case: ~8x)"
savingBasis: cited
qualityRisk: Medium
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
  - "workflow/plan-spec-before-code"
  - "workflow/scope-and-specify-task"
  - "context/tool-output-filtering"
  - "context/explorer-subagent"
sources:
  - id: adamhjk
    title: "A practical guide to reducing token spend"
    publisher: "Adam Jacob (adamhjk.com)"
    url: "https://www.adamhjk.com/blog/a-practical-guide-to-reducing-token-spend/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Garfield skill 4,639,565 tokens / 23 agents / 12.8 min → swamp workflow 506,484 tokens / 3 agents / 6.6 min = ~8x fewer tokens, ~2x faster. Argument: an LLM coordinator is 'the most expensive loop possible' — put deterministic code in the hot path, call agents only for judgment."
  - id: cc-skills
    title: "Extend Claude with skills (custom commands merged into skills)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/skills"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom commands merged into skills; .claude/commands/*.md and .claude/skills/*/SKILL.md both create /name. !`cmd` dynamic context injection runs a shell command and inlines its output before the model sees the skill. hooks frontmatter registers hooks for the session; allowed-tools pre-approves tools."
  - id: cc-hooks
    title: "Hooks"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/hooks"
    accessed: "2026-08-10"
    kind: docs
    note: "PreToolUse/PostToolUse/Stop hooks run deterministic shell logic around the agent loop without spending model turns."
  - id: cc-headless
    title: "Run Claude Code programmatically (headless / -p)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/headless"
    accessed: "2026-08-10"
    kind: docs
    note: "claude -p / --print drives the agent from a script; a shell/CI script becomes the orchestrator, the model handles individual steps."
  - id: aider-commands
    title: "In-chat commands (/run, /load, /test)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/commands.html"
    accessed: "2026-08-10"
    kind: docs
    note: "/run (alias !) runs a shell command and optionally adds output; /test adds output only on non-zero exit; /load replays commands from a file. Aider also scripts via --message/-m and a Python API."
  - id: opencode-commands
    title: "Commands"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/commands/"
    accessed: "2026-08-10"
    kind: docs
    note: "Custom commands are markdown in .opencode/commands/ (or ~/.config/opencode/commands/); !`command` injects bash output into the prompt; $ARGUMENTS passes args."
  - id: cline-workflows
    title: "Stop adding rules when you need workflows"
    publisher: "Cline (cline.ghost.io)"
    url: "https://cline.ghost.io/stop-adding-rules-when-you-need-workflows/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Workflows live in .clinerules/workflows/, invoked as /name.md; they script CLI steps (gh pr view/diff, npm test, docker deploy). Roo's custom modes appear as slash commands and can restrict tool groups."
  - id: codex-cli
    title: "Codex CLI (codex exec non-interactive)"
    publisher: "OpenAI Codex docs"
    url: "https://learn.chatgpt.com/docs/codex/cli"
    accessed: "2026-08-10"
    kind: docs
    note: "codex exec runs one session to completion with no TUI, so a shell/CI script can orchestrate it; --system-prompt-file / AGENTS.md steer each step. No per-tool slash-command/hook orchestration layer."
  - id: cursor-hooks
    title: "Hooks / Headless CLI"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/hooks"
    accessed: "2026-08-10"
    kind: docs
    note: "Cursor hooks (.cursor/hooks.json): beforeShellExecution/afterShellExecution, preToolUse/postToolUse, subagentStart/Stop run deterministic logic around the loop; agent -p drives it headlessly from a script."
  - id: cc-costs
    title: "Manage costs effectively (agent teams ~7x tokens)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Agent teams use ~7x the tokens of a standard session — each teammate is its own context window."
---

## What & why

When a workflow puts one LLM in charge of coordinating other LLMs — a "coordinator" or "manager" agent
that spawns sub-agents, reads their output, decides what runs next, and adjudicates results — you pay
model tokens for the coordination itself, not just the work. Each coordination decision is another
turn that re-sends context, and each sub-agent is its own context window (agent teams run about **7x**
the tokens of a single session).[^cc-costs] Deterministic orchestration moves the coordination — the
sequencing, branching, retries, and pass/fail checks — into ordinary code (a script, a hook, a
slash-command/workflow file) and spends LLM turns only on the steps that actually need judgment. The
lever is turns and calls: you delete the coordinator's turns and the redundant sub-agents, keeping the
model in the loop only where its intelligence is required.

## How to do it

Look at a multi-step workflow and split each step into one of two buckets: **decidable in code** (does
the build pass? did the file change? which of three branches applies? loop until green) versus **needs a
model** (write this function, judge whether this design is sound). Then invert the control flow so code
is the orchestrator and the model is a callee, not the other way round.

1. **Find the coordinator turns.** Any place an LLM is reading another LLM's output only to route, gate,
   or retry — "did that sub-agent succeed? then do the next thing" — is a candidate to replace with an
   `if`/loop in code. That check is deterministic; you're paying a non-deterministic model to do it.[^adamhjk]
2. **Move sequencing and gating into a script or workflow file.** Encode the step order, the retry loop,
   and the pass/fail gates (test exit code, lint result, diff present) as plain code. Call the agent for
   the one step that needs it, read its result programmatically, and let the script decide what runs next.
   Some tools give you a native place for this — a workflow file that scripts the CLI steps directly.[^cline-workflows]
3. **Use hooks for the checks that must run every loop.** A pre/post-tool or stop hook runs your gate
   (format, test, lint, "no secret committed") as deterministic shell logic around the agent loop, with
   no model turn spent on deciding to run it.[^cc-hooks][^cursor-hooks]
4. **Inject facts with commands, not a sub-agent.** Where a step just needs the current state (the diff,
   the failing test, the open PR), inline a shell command's output directly into the prompt instead of
   spawning an agent to go fetch it — the command costs no model tokens.[^cc-skills][^opencode-commands][^aider-commands]
5. **Drive it headlessly for anything unattended.** For CI or scheduled runs, the outer script (or the
   tool's `-p`/`exec` mode) is the orchestrator; the model handles individual steps.[^cc-headless][^codex-cli]
6. **Keep agents only where judgment lives.** The goal isn't zero agents — it's that the expensive
   non-deterministic loop (an LLM grading LLMs) is replaced by code, and each remaining agent call earns
   its tokens.[^adamhjk]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool command/hook/workflow mechanism.

## When it's worth it / when not

- **Worth it:** repeatable, multi-step workflows you run often — a PR-review pipeline, a
  scaffold-then-test loop, a release checklist, a triage pass. The sequencing is stable, so it's cheap to
  encode once and reuse.
- **Worth it:** any workflow that currently uses a coordinator/manager agent whose main job is dispatch
  and adjudication rather than writing code. That's the ~8x case.[^adamhjk]
- **Not:** genuinely exploratory or one-off work where you don't yet know the steps — writing the
  orchestration code would cost more than the tokens it saves, and the plan changes every run.
- **Not:** steps that actually need judgment. Don't hard-code a decision that depends on reading code or
  weighing a trade-off; that's the part you keep the model for.

## What it costs you

- **Setup effort (Medium).** You write and maintain the orchestration code, and you keep it in sync as the
  workflow changes. This is engineering, not a config flag — worth it only when the workflow repeats.
- **Brittleness on the deterministic path.** Code does exactly what you wrote; if a step's real-world
  shape drifts (a new error format, a renamed check), the script breaks where an LLM coordinator might have
  adapted. Guard the gates and fail loudly rather than silently skipping a step.
- **Over-scripting a decision that needed judgment.** If you hard-code a branch that actually depended on
  understanding the code, you'll get a confidently wrong path. Keep the model on the genuinely ambiguous
  steps.
- **Maintenance surface.** A hooks-and-scripts orchestration layer is one more thing to own, test, and
  onboard people to. Start with the one workflow that's clearly coordination-heavy, not everything at once.

## How to verify

- Compare **total tokens and turns for the same workflow, end to end**, before and after moving
  coordination into code — the win shows up as fewer turns and fewer sub-agent context windows, not a
  cheaper single step.
- Watch the **share of tokens spent on coordinator/sub-agent turns** (per-session attribution via
  `/usage` in Claude Code, or `ccusage`); driving that share down is the point.
- Confirm **quality held**: same task success rate / passing tests after the change, so you know you cut
  coordination overhead and not necessary judgment.

## Measured impact

_Not yet measured by us._ Benchmark: take one coordination-heavy workflow (a coordinator agent
dispatching several sub-agents) and run it two ways on the same repo — the LLM-coordinated baseline
versus a variant where the sequencing, gating, and retries live in a script/hook and the model is called
only for the judgment steps — then compare total tokens, total turns, and task success. One practitioner
reports a skill-based, 23-agent workflow at **4,639,565 tokens** dropping to a 3-agent deterministic
workflow at **506,484 tokens** — about **8x fewer tokens** and roughly half the runtime — by replacing
the coordinator agents with deterministic code.[^adamhjk] ⚠ That is a single practitioner case on one
workflow, not an independent measurement; the realized saving depends on how much of your workflow is
coordination versus genuine judgment.

[^adamhjk]: Adam Jacob, "A practical guide to reducing token spend" — <https://www.adamhjk.com/blog/a-practical-guide-to-reducing-token-spend/>
[^cc-skills]: Claude Code docs, "Extend Claude with skills" — <https://code.claude.com/docs/en/skills>
[^cc-hooks]: Claude Code docs, "Hooks" — <https://code.claude.com/docs/en/hooks>
[^cc-headless]: Claude Code docs, "Run Claude Code programmatically (headless / -p)" — <https://code.claude.com/docs/en/headless>
[^aider-commands]: Aider docs, "In-chat commands" — <https://aider.chat/docs/usage/commands.html>
[^opencode-commands]: OpenCode docs, "Commands" — <https://opencode.ai/docs/commands/>
[^cline-workflows]: Cline, "Stop adding rules when you need workflows" — <https://cline.ghost.io/stop-adding-rules-when-you-need-workflows/>
[^codex-cli]: OpenAI Codex docs, "Codex CLI" — <https://learn.chatgpt.com/docs/codex/cli>
[^cursor-hooks]: Cursor docs, "Hooks / Headless CLI" — <https://cursor.com/docs/hooks>
[^cc-costs]: Claude Code docs, "Manage costs effectively" — <https://code.claude.com/docs/en/costs>
