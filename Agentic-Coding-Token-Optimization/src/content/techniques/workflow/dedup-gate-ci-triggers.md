---
title: "Dedup / gate CI agent triggers"
group: workflow
level: 2
costLever: [calls]
effort: Low
savingEstimate: "varies — proportional to duplicate runs removed"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - copilot
  - codex
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "workflow/deterministic-orchestration"
sources:
  - id: gha-triggers
    title: "Triggering a workflow — events, path and branch filters, activity types"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow"
    accessed: "2026-08-10"
    kind: docs
  - id: gha-concurrency
    title: "Control the concurrency of workflows and jobs"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs"
    accessed: "2026-08-10"
    kind: docs
  - id: cc-gha
    title: "Claude Code GitHub Actions"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/github-actions"
    accessed: "2026-08-10"
    kind: docs
    note: "trigger_phrase default @claude; if: gate stops runners on non-@claude comments; rejects bot actors unless allowed_bots (loop guard); Code Review skips drafts and PRs it already commented on."
  - id: cc-action-usage
    title: "claude-code-action — configuration reference (inputs)"
    publisher: "anthropics/claude-code-action"
    url: "https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md"
    accessed: "2026-08-10"
    kind: repo
    note: "trigger_phrase, assignee_trigger, label_trigger inputs."
  - id: cursor-bugbot
    title: "Bugbot"
    publisher: "Cursor Docs"
    url: "https://cursor.com/docs/bugbot"
    accessed: "2026-08-10"
    kind: docs
    note: "Only run once per PR (skip subsequent commits); manual-only via cursor review / bugbot run."
  - id: skip-dup
    title: "skip-duplicate-actions"
    publisher: "step-security/skip-duplicate-actions"
    url: "https://github.com/step-security/skip-duplicate-actions"
    accessed: "2026-08-10"
    kind: repo
    note: "concurrent_skipping, cancel_others, paths_ignore, skip_after_successful_duplicate."
  - id: copilot-agent
    title: "Using Copilot to work on an issue"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/using-github-copilot/coding-agent/using-copilot-to-work-on-an-issue"
    accessed: "2026-08-10"
    kind: docs
    note: "Coding agent runs when an issue is assigned to it (manually, via API, or a label rule) — not on every push."
  - id: pr-cost
    title: "Claude Code in GitHub Actions: Automate PR Reviews and Bug Fixes — per-PR review cost"
    publisher: "Blink Blog"
    url: "https://blink.new/blog/claude-code-github-actions"
    accessed: "2026-08-19"
    kind: blog
    note: "~$0.50–$2 per review on small PRs (under 100 lines, Sonnet), $5–$15 on large/complex ones (practitioner estimate)."
---

## What & why

A CI agent that reviews or fixes code costs a whole model run each time it fires. If it is wired to
`push`, `issue_comment`, or every `pull_request` event, it re-runs on every follow-up commit, every
`@`-less comment, and every docs-only change — many of those runs add nothing. This technique gates
and de-duplicates the triggers so the pipeline invokes the agent only when a run is actually wanted.
The lever is the number of whole runs (calls), not the tokens inside a run.

## How to do it

The portable idea: **decide the exact conditions under which the agent should run, then encode them
so no other event starts a run.** Four gates, cheapest first:

1. **Filter the event.** Only listen to the activity types you mean. On GitHub Actions, use
   `on.<event>.types` (for example `pull_request: types: [opened, ready_for_review]` instead of the
   default set that includes `synchronize`, which fires on every push).[^gha-triggers]
2. **Filter by path and branch.** `paths` / `paths-ignore` skips docs-only or vendored changes;
   `branches` / `branches-ignore` keeps the agent off branches it shouldn't touch.[^gha-triggers]
   (Note the known gap: `paths-ignore` looks only at the current push, so its effect depends on how
   you batch commits.)
3. **Gate the job with `if:`.** A job-level `if:` condition stops a runner from even starting on
   comments that don't contain the trigger phrase, or on draft PRs — cheaper than starting the agent
   and having it decide to no-op.[^cc-gha]
4. **De-duplicate rapid runs.** A `concurrency` group with `cancel-in-progress: true` cancels the
   in-flight run when a newer commit arrives, so a burst of pushes yields one run, not five.[^gha-concurrency]
   For skip-if-nothing-changed logic across commits, a dedup action such as `skip-duplicate-actions`
   adds `concurrent_skipping`, `cancel_others`, `paths_ignore`, and `skip_after_successful_duplicate`.[^skip-dup]

Two agent-specific habits that matter: prefer **review once per PR** over review-on-every-push
(Cursor Bugbot has an explicit "only run once per PR" setting, and is manual-only via `cursor review`
/ `bugbot run`),[^cursor-bugbot] and keep the **bot-loop guard** on so an agent's own commits or
comments don't trigger another agent (Claude Code rejects bot actors unless you list them in
`allowed_bots`; its trigger is scoped by the `trigger_phrase`, `assignee_trigger`, and
`label_trigger` inputs).[^cc-gha][^cc-action-usage]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool setting (event/`if:` gates and
`concurrency` for Claude Code; the "only run once per PR" toggle for Cursor Bugbot; assign/label
triggers for the Copilot and Codex coding agents, which run when an issue is assigned to the agent
rather than on every push).[^copilot-agent]

## When it's worth it / when not

- **Worth it:** any repo where the agent is wired to high-frequency events (pushes, all comments) and
  most runs are redundant — a chatty PR or a rebased branch can otherwise trigger many full runs.
- **Worth it:** monorepos where a change usually touches one area but the agent runs on the whole PR;
  path filters cut the runs that had nothing to review.
- **Not worth it / be careful:** don't gate so tightly that the agent misses the run you needed —
  e.g. filtering out `synchronize` entirely means no re-review after a fix. Gate to "once per
  meaningful change," not "never re-run."
- **Not applicable:** local, interactive CLI use (Aider, Cline/Roo, OpenCode, Grok Build with no
  hosted CI agent) — there's no per-event trigger to dedup. This is a CI/hosted-agent technique.

## What it costs you

- **Setup effort is Low** — it's a few lines of workflow YAML or a settings toggle, no new
  infrastructure.
- **The failure mode is over-gating:** a filter that also skips the run you wanted (a real fix pushed
  after the first review, a comment that should have triggered the agent). Watch for "the agent
  didn't review my latest commit" reports and loosen the offending filter.
- **`paths-ignore` is per-push, not per-diff**, so a filter that looks correct can still let a
  docs-only change through if it shares a push with code — verify against your team's commit habits.
- **Concurrency cancellation discards work in progress**; that's fine for idempotent review runs but
  check it isn't cancelling an agent mid-edit that pushes commits.

## How to verify

- Count agent runs per PR before and after (Actions run history, or the agent's own run log). The
  target is one run per meaningful change instead of one per push/comment.
- Watch the agent's monthly run count and spend. Per-PR agent review is commonly quoted at ~$0.50–$2
  for small PRs and $5–$15 for large ones, so removed duplicate runs map almost linearly to saved
  spend.[^pr-cost] ⚠ practitioner estimate.
- Confirm the loop guard holds: the agent's own commits/comments should not appear as new triggering
  events in the run history.

## Measured impact

_Not yet measured by us._ Benchmark: take one PR with a realistic push/comment cadence (opened → a
few follow-up commits → a couple of comments) and run it twice — once with the agent on the default
broad triggers, once with event/path filters + `concurrency` dedup + once-per-PR review — then
compare the **number of agent runs** and total spend for the same delivered review. Savings scale
with how many duplicate runs the baseline fired. Cited anchor: per-PR agent-review cost of ~$0.50–$2
(small) to $5–$15 (large) sets the per-removed-run value.[^pr-cost] ⚠ practitioner estimate, not
independently verified.

[^gha-triggers]: GitHub Docs, "Triggering a workflow" — <https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow>
[^gha-concurrency]: GitHub Docs, "Control the concurrency of workflows and jobs" — <https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs>
[^cc-gha]: Claude Code docs, "Claude Code GitHub Actions" — <https://code.claude.com/docs/en/github-actions>
[^cc-action-usage]: anthropics/claude-code-action, "Configuration reference (inputs)" — <https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md>
[^skip-dup]: step-security/skip-duplicate-actions — <https://github.com/step-security/skip-duplicate-actions>
[^cursor-bugbot]: Cursor Docs, "Bugbot" — <https://cursor.com/docs/bugbot>
[^copilot-agent]: GitHub Docs, "Using Copilot to work on an issue" — <https://docs.github.com/en/copilot/using-github-copilot/coding-agent/using-copilot-to-work-on-an-issue>
[^pr-cost]: Blink Blog, "Claude Code in GitHub Actions: Automate PR Reviews and Bug Fixes" — <https://blink.new/blog/claude-code-github-actions>
