---
title: "Headless / CI cost discipline"
group: workflow
level: 2
costLever: [calls, turns, input, model-price]
effort: Medium
savingEstimate: "varies — caps the tail of runaway CI runs"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - claude-code
  - copilot
  - codex
  - cursor
  - aider
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/session-cadence"
  - "context/tool-output-filtering"
  - "model-routing/task-class-model-tier-map"
sources:
  - id: cc-cli
    title: "CLI reference (-p / --print, --max-turns, --model, --output-format)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/cli-reference"
    accessed: "2026-08-10"
    kind: docs
    note: "--print runs a single non-interactive query; --max-turns 'Limit the number of agentic turns (print mode only). Exits with an error when the limit is reached. No limit by default.'; --model, --output-format text|json|stream-json, --permission-mode."
  - id: cc-gha
    title: "Claude Code GitHub Actions"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/github-actions"
    accessed: "2026-08-10"
    kind: docs
    note: "Automation mode when a prompt input is set. Manage costs: set --max-turns in claude_args, --model to pin the tier, workflow-level timeouts and GitHub concurrency controls to avoid runaway jobs. claude_args passes any CLI argument."
  - id: codex-cli
    title: "Codex CLI — developer commands (codex exec)"
    publisher: "OpenAI / ChatGPT developer docs"
    url: "https://learn.chatgpt.com/docs/developer-commands?surface=cli"
    accessed: "2026-08-10"
    kind: docs
    note: "codex exec (alias codex e) = scripted non-interactive run; --model/-m; --sandbox/-s read-only|workspace-write|danger-full-access; --output-last-message/-o; --full-auto deprecated in favour of --sandbox workspace-write. No native per-run turn/cost cap flag documented."
  - id: codex-gh
    title: "Codex — GitHub integration"
    publisher: "OpenAI / ChatGPT developer docs"
    url: "https://learn.chatgpt.com/docs/github-action"
    accessed: "2026-08-10"
    kind: docs
    note: "Codex ships a GitHub Action and a non-interactive mode for CI/CD."
  - id: copilot-agent
    title: "About Copilot coding agent"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent"
    accessed: "2026-08-10"
    kind: docs
    note: "Runs in an ephemeral GitHub Actions-powered environment; billed in GitHub Actions minutes + AI credits (model + token dependent); model may be selectable at task start; session hard cap 59 min, configurable shorter via copilot-setup-steps.yml timeout-minutes."
  - id: rf-batch
    title: "Research findings — Batch API is async-only"
    publisher: "Bonsai Labs (internal)"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Batch API = 50% off input & output and stacks with prompt-cache discounts, but is async-only and explicitly not for interactive/stateful agent sessions — so it fits offline CI work (bulk evals, offline refactors), not live loops."
---

## What & why

An agent running in a pipeline has no human watching the token meter. A `@claude` mention that
loops, a coding-agent job that retries, a scheduled run that fans out over every open PR — each
burns tokens on its own and there is no one to hit stop. This technique is about putting the guard
rails the CI environment removes back in: a per-run turn cap, a pinned (usually cheaper) model,
caching left on, and non-interactive mode set to fail fast rather than idle. It pulls the *calls*
and *turns* levers (a hard ceiling on how much work one run can do) and the *model-price* lever (the
CI tier doesn't need to be your flagship).

## How to do it

Every headless run should carry four controls. They are portable ideas; the exact flag or setting
is in this technique's row in `TOOL_MATRIX.md`.

1. **Run in non-interactive mode, and make it fail fast.** Use the tool's print/exec mode (a single
   query, no REPL) so the job is scriptable and terminates — Claude Code's `-p`/`--print` or Codex's
   `codex exec`.[^codex-cli] In non-interactive mode a turn cap
   should *error out*, not silently prompt for more — a stuck agent that can't ask a human should
   die, not spin. Claude Code's `--max-turns` in print mode exits with an error when the limit is
   reached;[^cc-cli] lean on that behaviour rather than a wall-clock timeout alone.

2. **Cap the run.** Set a per-run turn ceiling so one job can't loop indefinitely, and back it with
   a workflow-level wall-clock timeout and concurrency limits so a flood of triggers can't fan out
   into many parallel paid runs at once.[^cc-gha] The turn cap bounds tokens per run; the timeout
   and concurrency limits bound how many runs happen.

3. **Pin a cheaper model.** CI work — reviews, lint fixes, routine issue-to-PR — rarely needs the
   top tier. Set the model explicitly for the run instead of inheriting an interactive default, and
   size it to the task class (see `model-routing/task-class-model-tier-map`). Pinning also stops a
   silent upgrade to a pricier default from doubling your CI bill without a config change.

4. **Keep caching on.** Headless runs re-send the same repo rules, system prompt, and tool
   definitions every invocation; that prefix should hit the cache, not be re-billed. Caching is
   managed for you in the hosted CI agents (Copilot coding agent, Codex Cloud), but for a
   self-hosted `-p` / `exec` job confirm the prompt cache is enabled and warm — a run that starts
   cold after the TTL lapses re-pays the whole prefix (see the caching group).

**One offline-only lever.** If the CI work is genuinely batchable and doesn't need a live loop —
bulk evals, an overnight refactor pass, PR triage — the Batch API is 50% off input and output and
stacks with the cache discount. It is **async-only and explicitly not for interactive/stateful
agent sessions**,[^rf-batch] so it fits queued offline jobs, not a `@claude`-mention responder.

## When it's worth it / when not

- **Worth it:** any repo where an agent runs unattended — `@claude` on issues/PRs, a Copilot coding
  agent assigned to issues, a Codex or Claude Code job (both ship a GitHub Action for CI/CD) on a
  cron or on every PR.[^codex-gh] The less a human is watching, the more the caps matter.
- **Worth it most:** scheduled fan-out (run over every open PR / issue) and auto-retry triggers,
  where one misconfiguration multiplies across many paid runs.
- **Not worth it:** a one-off local `-p` script you run by hand and watch — the interactive session's
  own discipline already covers it.
- **Don't cap so tight it fails the task:** a turn ceiling below what the job needs just burns the
  tokens up to the cap and then errors with nothing to show, so you pay twice (the capped run, then
  the human who finishes it). Set the cap from an observed turn count, not a guess.

## What it costs you

- **Quality risk is Medium, and it's the turn cap.** Too low and real work gets cut off mid-task;
  too high and it isn't a guard rail. The failure mode is a job that hits the ceiling on a task it
  could have finished in two more turns — wasted tokens and a red run. Mitigate by setting the cap
  from real runs and raising it deliberately, not reflexively.
- **A cheaper CI model can lower output quality** — a review that misses issues, a fix that doesn't
  hold. Gate merges on your normal CI (tests, human review) so a weaker model can't ship on its own.
- **Setup effort is Medium:** wiring the flags into a workflow file, choosing the caps, and pinning
  the model per pipeline. It's config, done once per pipeline, not per run.
- **Watch the two-meter bill.** The hosted CI agents charge *both* GitHub Actions minutes *and* AI
  credits/tokens;[^copilot-agent] a run can be cheap on tokens but slow (and costly) on runner
  minutes, or vice versa. Cap both — token/turn limits and the job timeout.

## How to verify

- Attribute CI spend separately from interactive spend. Route CI runs through a gateway with a
  per-environment tag (or a distinct key) so the pipeline's token/call total shows up on its own,
  and watch **cost per CI run** and **runs per day** — a jump in either is the runaway you're
  guarding against.
- Confirm the cap is actually biting: check how often runs **exit on the turn limit**. A rising
  hit-rate means either the cap is too low for the task or the agent is looping — both worth a look.
- Confirm caching is warm on self-hosted headless jobs: the run's cache-read share should be high;
  a burst of cache-*creation* every run means the prefix isn't being reused.

## Measured impact

_Not yet measured by us._ Benchmark: run the same CI task (e.g. a review or an issue-to-PR job) on a
fixed repo two ways — a baseline headless run with no turn cap on the flagship model, versus the
same run with a per-run turn cap, a pinned cheaper model, and caching confirmed on — and compare
tokens, call count, and cost per completed run, plus how often the capped variant exits on the
limit. Report GitHub Actions minutes alongside tokens, since the hosted CI agents bill both.[^copilot-agent]
The saving here is mostly in the *tail*: it bounds the worst runs (loops, fan-out) rather than
shaving a fixed percentage off a typical one, so report the distribution, not just the mean.

[^cc-cli]: Claude Code docs, "CLI reference" — <https://code.claude.com/docs/en/cli-reference>
[^cc-gha]: Claude Code docs, "Claude Code GitHub Actions" — <https://code.claude.com/docs/en/github-actions>
[^codex-cli]: OpenAI / ChatGPT developer docs, "Developer commands (codex exec)" — <https://learn.chatgpt.com/docs/developer-commands?surface=cli>
[^codex-gh]: OpenAI / ChatGPT developer docs, "GitHub Action" — <https://learn.chatgpt.com/docs/github-action>
[^copilot-agent]: GitHub Docs, "About Copilot coding agent" — <https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent>
[^rf-batch]: Claude pricing (Batch API is async-only, not for interactive agent sessions) — <https://platform.claude.com/docs/en/about-claude/pricing>
