---
title: "Terse output & diff-only edits"
group: context
level: 1
costLever: [output, input]
effort: Low
savingEstimate: "large on edit- and explanation-heavy turns"
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
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: aider-editformats
    title: "Edit formats"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/more/edit-formats.html"
    accessed: "2026-08-10"
    kind: docs
    note: "diff / diff-fenced / udiff send only changed portions; whole returns the entire file. --edit-format selects it; --editor-edit-format for architect mode."
  - id: aider-udiff
    title: "Unified diffs make GPT-4 Turbo 3X less lazy"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/unified-diffs.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Switching to unified diffs cut lazy/omitted-code outputs and raised benchmark scores; diffs return only the changed lines."
  - id: codex-verbosity
    title: "Codex CLI Output Control: Tuning Verbosity, Reasoning Summaries, and Token Budgets"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/05/02/codex-cli-output-control-verbosity-reasoning-summaries-token-budgets/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "model_verbosity = low/medium(default)/high; low is code-focused, minimal prose, reported to cut output tokens 40–60% on explanation-heavy tasks. model_reasoning_summary auto/concise/detailed/none."
  - id: codex-applypatch
    title: "The V4A Diff Format: How Codex CLI's apply_patch Actually Edits Your Code"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex edits via apply_patch emitting V4A diffs (@@ context + / - lines), not whole-file rewrites."
  - id: cc-output-styles
    title: "Output styles"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/output-styles"
    accessed: "2026-08-10"
    kind: docs
    note: "No built-in 'concise' style, but a custom output style / --append-system-prompt / CLAUDE.md can set a terse tone. Note Explanatory & Learning styles increase output tokens by design."
  - id: cc-costs
    title: "Costs"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "Claude Code's Edit tool applies string search/replace edits; output tokens are billed and re-enter context on the next turn. /context shows the running window."
---

## What & why

Two things drive output tokens on a coding turn: how much the model *says*, and how it *writes edits*. Both
also feed back into input cost — every token the model emits is billed as output, then re-enters the context
window on the next turn and is billed again as input for the rest of the session. So a turn that narrates its
plan, re-quotes the file it just read, and then reprints the whole 400-line file to change three lines pays
for all of that twice: once as output now, and again as input on every later turn until the conversation is
compacted. This technique pulls the **output** lever (and, through the feedback into context, **input**) with
two instructions: tell the agent to answer concisely, and make it edit files with patches/diffs instead of
reprinting them whole.[^aider-editformats][^cc-costs]

## How to do it

Two independent moves, both low-effort. Do either or both.

1. **Ask for terse output.** Put a short standing instruction in the rules file (or a concise output
   style / system-prompt append) telling the agent to skip preamble and narration, not re-quote code it
   just read, and answer in the fewest words that are still correct. Claude Code has no built-in "concise"
   style, but a custom output style, `--append-system-prompt`, or CLAUDE.md can set the terse tone (and its
   Explanatory/Learning styles go the other way, adding output by design).[^cc-output-styles] Some tools also
   expose a verbosity dial that does this without prompt tokens — set it to the low/terse setting. This mainly
   cuts the prose the model wraps around its work (plans, restated requirements, "here's what I did"
   recaps).[^codex-verbosity]

2. **Use a diff/patch edit format, not whole-file rewrites.** Make the agent return only the changed lines
   as a patch (search/replace block, unified diff, or the tool's native patch format) instead of reprinting
   the entire file to change part of it. On any non-trivial file this is the larger of the two wins, because
   a whole-file rewrite scales with file size while a diff scales with the size of the change. Most agents
   already default to a diff-style edit tool; the lever is (a) confirm it isn't set to a whole-file format,
   and (b) don't ask for the full updated file in your prompt.[^aider-editformats][^aider-udiff]

A caution that comes with the second move: on some models a too-strict diff format raises failed/rejected
edits (the model can't match its patch to the file), which triggers a retry and re-pays the tokens. Aider's
own reason for unified diffs was the opposite — they cut lazy, omitted-code outputs and raised success —
but the right format is model-dependent, so pick the format the tool recommends for your model rather than
forcing the tersest one.[^aider-udiff]

See this technique's row in `TOOL_MATRIX.md` for each tool's exact verbosity dial and edit-format flag or
setting.

## When it's worth it / when not

- **Worth it:** almost always, as a default. Terse-output instructions are a zero-infrastructure change; a
  diff edit format is already how most agents work, so this is mostly "don't turn it off."
- **Biggest wins:** turns that edit large files (diff vs whole-file), and explanation- or planning-heavy
  work where the model narrates a lot (verbosity dial). Codex's own docs put the verbosity saving at 40–60%
  of output on explanation-heavy tasks.[^codex-verbosity]
- **Not worth it (or ease off):** when you genuinely want the narration — a design discussion, a code
  walkthrough, a teaching session — a terse setting fights you. Scope the concise instruction to
  implementation turns, not every interaction.
- **Watch the edit format on weak models.** If a model struggles to produce valid diffs it will retry or
  fall back, so the whole-file format can occasionally be *cheaper overall* on small files with a
  diff-fragile model. Verify rather than assume.

## What it costs you

- **Setup:** minutes. A line or two in the rules file, one verbosity setting, and a check that the edit
  format isn't whole-file.
- **Over-terseness hides reasoning you sometimes need.** If the agent stops explaining, a wrong edit is
  harder to catch before it lands. Keep enough output to review the change; cut the recap, not the "what
  I changed and why" one-liner.
- **Diff-format edit failures.** A patch that doesn't apply cleanly costs a retry (and re-pays those
  tokens). This is the main failure mode of the diff half — mitigate by using the format the tool
  recommends for your model, not the most aggressive one.[^aider-editformats]
- **Suppressing reasoning summaries can cut too much.** Tools that let you drop the reasoning summary
  entirely (e.g. Codex `model_reasoning_summary = none`) save tokens but remove a review aid; prefer a
  concise summary over none if you read them.[^codex-verbosity]

## How to verify

- Watch **output tokens per turn** on an edit-heavy task before and after — a diff edit format shows the
  clearest drop on large-file changes. `ccusage` and Claude Code OTel split usage into input/output so you
  can see the output line move; Claude Code `/context` shows the running window that output feeds back into.[^cc-costs]
- Confirm the **edit format actually in use**: check that edits arrive as patches/diffs, not full-file
  reprints, in the tool's transcript or diff view (Aider reports its active edit format; Codex applies
  changes via `apply_patch`).[^aider-editformats][^codex-applypatch]
- Spot-check **edit-failure/retry rate** after changing the format — a rise means the format is too strict
  for the model and is eating the saving.

## Measured impact

_Not yet measured by us._ Benchmark: run the same edit-heavy task set two ways — a baseline that lets the
agent narrate freely and reprint whole files, versus a variant that sets a terse/low-verbosity instruction
and a diff/patch edit format — and compare output tokens per turn, total input tokens across the session
(since output re-enters context), and cost per passing task, while tracking edit-failure rate so a diff
format that raises retries is caught. Cited so far: Codex documents `model_verbosity = "low"` cutting output
tokens 40–60% on explanation-heavy tasks,[^codex-verbosity] and Aider reports diff/unified-diff formats
return only changed lines and reduced lazy, omitted-code outputs versus whole-file rewrites.[^aider-editformats][^aider-udiff]
⚠ Both are vendor/practitioner figures, not independently verified.

[^aider-editformats]: Aider docs, "Edit formats" — <https://aider.chat/docs/more/edit-formats.html>
[^aider-udiff]: Aider docs, "Unified diffs make GPT-4 Turbo 3X less lazy" — <https://aider.chat/docs/unified-diffs.html>
[^codex-verbosity]: Codex Knowledge Base, "Codex CLI Output Control" — <https://codex.danielvaughan.com/2026/05/02/codex-cli-output-control-verbosity-reasoning-summaries-token-budgets/>
[^codex-applypatch]: Codex Knowledge Base, "The V4A Diff Format: How Codex CLI's apply_patch Actually Edits Your Code" — <https://codex.danielvaughan.com/2026/03/31/codex-cli-apply-patch-v4a-diff-format/>
[^cc-output-styles]: Claude Code docs, "Output styles" — <https://code.claude.com/docs/en/output-styles>
[^cc-costs]: Claude Code docs, "Costs" — <https://code.claude.com/docs/en/costs>
