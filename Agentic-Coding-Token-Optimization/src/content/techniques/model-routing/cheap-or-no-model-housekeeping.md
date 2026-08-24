---
title: "Cheap model — or no model — for housekeeping"
group: model-routing
level: 1
costLever: [output, calls, model-price]
effort: Low
savingEstimate: "small per call, adds up"
savingBasis: estimate
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - aider
  - copilot
  - codex
  - opencode
  - cline
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/deterministic-orchestration"
  - "workflow/when-not-to-use-agent"
  - "model-routing/strong-plan-cheap-execute-split"
sources:
  - id: aider
    title: "Options reference (--weak-model, --no-auto-commits, --commit-prompt)"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/config/options.html"
    accessed: "2026-08-10"
    kind: docs
    note: "--weak-model = model for commit messages and chat-history summarization; --no-auto-commits disables auto-commit; --commit-prompt sets a custom commit-message prompt."
  - id: aider-git
    title: "Git integration"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/git.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Aider sends the weak model a copy of the diffs and chat history to produce a commit message; commit_message_models() returns [weak_model, main_model]."
  - id: cc-subagents
    title: "Create custom subagents (model field)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/sub-agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Subagent YAML frontmatter model: accepts haiku|sonnet|opus|fable|<full id>|inherit; CLAUDE_CODE_SUBAGENT_MODEL overrides globally. No dedicated commit-message model dial."
  - id: opencode
    title: "Config — small_model"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/config/"
    accessed: "2026-08-10"
    kind: docs
    note: "small_model configures a separate model for lightweight tasks like title generation; falls back to main model if no cheaper one is available."
  - id: copilot-commit
    title: "commitMessageGeneration.instructions setting"
    publisher: "GitHub Copilot / VS Code docs"
    url: "https://docs.github.com/en/copilot/responsible-use/copilot-commit-message-generation"
    accessed: "2026-08-10"
    kind: docs
    note: "Copilot exposes github.copilot.chat.commitMessageGeneration.instructions (custom prompt), not a user-selectable model — the model is managed."
  - id: roo-condense
    title: "Context management — condensing uses the active model"
    publisher: "Roo Code docs (DeepWiki)"
    url: "https://deepwiki.com/RooCodeInc/Roo-Code-Docs/4.3.4-context-management-and-optimization"
    accessed: "2026-08-10"
    kind: docs
    note: "Roo/Cline condensing uses the active conversation model to avoid tool-call-format mismatch; no separate cheap model for housekeeping."
  - id: codex-routing
    title: "Codex CLI model routing — mini for subtasks"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/05/07/codex-cli-model-routing-may-2026-gpt55-gpt54-spark-decision-framework/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "GPT-5.4-mini positioned for subagents/subtasks at ~30% quota cost, ~2x speed. Practitioner source; no dedicated commit-message dial."
  - id: cc-costs
    title: "Manage costs (Haiku ~cheapest model tier)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Cheapest-tier model (Haiku) vs the top tier is a large per-token price gap; used here to justify routing housekeeping to the cheap tier."
---

## What & why

Some of what a coding agent produces is throwaway boilerplate: commit messages, session/PR titles,
short summaries, changelog lines, trivial mechanical refactors (rename, reformat, move a file). None
of these need the flagship model, and several don't need a model at all. Route them to the cheapest
capable model — or generate them deterministically with a script or template so no model is called —
and you cut output-token spend and, in the "no model" case, remove the call entirely. Per item the
saving is small; the frequency is what makes it matter (a commit message or a title is generated on
almost every change).

## How to do it

Two levers, in order of preference:

1. **No model — do it deterministically.** If the output is mechanical, a script or template is both
   free and more consistent than a model. A commit message can be a Conventional-Commits template
   filled from the staged diff (files touched, `type(scope):` from the path); a changelog line can be
   built from the commit; a rename or reformat is a `sed`/`codemod`/formatter run, not a prompt. This
   is the same instinct as "when not to use the agent" — if a deterministic tool gives the exact
   answer, don't spend tokens asking a model to approximate it.

2. **Cheap model — when you do want a model.** For text that benefits from a model but not a smart
   one (summaries, titles, commit messages over a messy diff), point the housekeeping task at the
   cheapest capable tier (Haiku-class, or a `mini` model) — a large per-token price gap versus the top
   tier.[^cc-costs] Most harnesses already have a slot for this: a "weak"/"small"/utility model that
   runs the background chores while your main model stays on the reasoning-heavy work.[^aider][^opencode]
   Where the harness lets you split work into subagents,
   give the housekeeping subagent the cheap model explicitly.[^cc-subagents]

Keep the main model on the actual engineering. This technique is only about the chores around it.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool flag or setting.

## When it's worth it / when not

- **Worth it:** any repo where the agent commits, titles, or summarizes often — which is most of
  them. Deterministic commit messages and formatter-driven refactors are a zero-regret default.
- **Best "no model" candidates:** commit/PR/session titles from a template, changelog entries,
  mechanical renames and reformatting, dependency-bump messages — anything with a fixed shape.
- **Best "cheap model" candidates:** summaries and messages where a template reads badly and a small
  model reads fine.
- **Not worth it:** a "simple" refactor that's actually a semantics change (extract-method that must
  preserve behaviour, a rename that crosses an API boundary) — that's real work; don't demote it to
  the weak model. And don't hand-build templating for a chore that happens twice a month.

## What it costs you

- **Quality risk is low but real for the cheap-model path:** a small model can write a vague or wrong
  commit message over a large diff. Mitigate by keeping the diff it sees small (stage focused
  commits) and letting the harness fall back to the main model when the weak one is unset or
  fails.[^aider-git]
- **Setup effort is Low:** for the cheap-model path it's one flag or config key. The deterministic
  path costs a little scripting up front (a commit-message template, a codemod) that then runs free
  forever.
- **Failure mode to watch:** over-applying the cheap model to work that isn't housekeeping (see
  above), which trades a few output tokens for a re-do on the main model — a net loss.
- **Not every tool separates this.** Some harnesses run housekeeping on the active conversation model
  by design (to avoid tool-call-format mismatches between models) and give you no cheap-model
  dial[^roo-condense]; others manage the housekeeping model for you and expose only a custom-prompt
  setting, not a model choice[^copilot-commit] — there the "no model / template" path is your only
  lever.

## How to verify

- Watch **output tokens** and **model mix** over a session that does a lot of commits/summaries:
  after routing, the cheap tier (or "no model") should own the housekeeping share. `ccusage` and
  Claude Code's `/usage` break usage down by model and by subagent, so you can confirm the chore
  traffic moved off the flagship.
- Spot-check the artifacts: commit messages and titles should still be accurate. If the cheap model
  produces junk, tighten the diff it sees or move that chore to a template.

## Measured impact

_Not yet measured by us._ Benchmark arm **R2**: run tasks T1–T3 twice — once with all housekeeping
(commit messages, titles, summaries) on the main model, once with it routed to the cheap tier and the
mechanical chores templated — and compare output tokens, call count, and cost per passing task
against the R0 single-model baseline. The expected effect is small per item and cumulative over a
session, not a step change. ⚠ The Codex "mini ≈ 30% quota cost, ~2× speed for subtasks" figure is
practitioner-sourced and not independently verified.[^codex-routing]

[^aider]: Aider docs, "Options reference" — <https://aider.chat/docs/config/options.html>
[^aider-git]: Aider docs, "Git integration" — <https://aider.chat/docs/git.html>
[^cc-subagents]: Claude Code docs, "Create custom subagents" — <https://code.claude.com/docs/en/sub-agents>
[^opencode]: OpenCode docs, "Config — small_model" — <https://opencode.ai/docs/config/>
[^copilot-commit]: GitHub Copilot docs, "Commit message generation" — <https://docs.github.com/en/copilot/responsible-use/copilot-commit-message-generation>
[^roo-condense]: Roo Code docs, "Context management" — <https://deepwiki.com/RooCodeInc/Roo-Code-Docs/4.3.4-context-management-and-optimization>
[^codex-routing]: Codex Knowledge Base, "Codex CLI model routing (May 2026)" — <https://codex.danielvaughan.com/2026/05/07/codex-cli-model-routing-may-2026-gpt55-gpt54-spark-decision-framework/>
[^cc-costs]: Claude Code docs, "Manage costs" — <https://code.claude.com/docs/en/costs>
