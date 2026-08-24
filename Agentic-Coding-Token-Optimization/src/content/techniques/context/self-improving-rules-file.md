---
title: "Self-improving rules file"
group: context
level: 2
costLever: [output, calls]
effort: Low
savingEstimate: "~16.6% fewer output tokens (cited)"
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
  - "context/keep-rules-file-small"
  - "context/tool-output-filtering"
sources:
  - id: agents-md-study
    title: "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents"
    publisher: "arXiv 2601.20404"
    url: "https://arxiv.org/abs/2601.20404"
    accessed: "2026-08-10"
    kind: paper
    verify: true
    note: "Paired within-task design, 10 repos / 124 PRs. With AGENTS.md: median output tokens -16.58%, median runtime -28.64%, comparable task completion. Practitioner-relevant but single study — flagged."
  - id: cc-memory
    title: "How Claude remembers your project"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/memory"
    accessed: "2026-08-10"
    kind: docs
    note: "'When to add to CLAUDE.md': same mistake a second time / a review catches something / you retype a correction. Auto memory (MEMORY.md) is on by default and records learnings itself."
  - id: cursor-rules
    title: "Rules"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/rules"
    accessed: "2026-08-10"
    kind: docs
    note: "/create-rule in Agent generates a rule file with frontmatter, saved to .cursor/rules/*.mdc."
  - id: cline-selfimprove
    title: "Double-clicking on toggleable .clinerules (+ self-improving Cline)"
    publisher: "Cline"
    url: "https://cline.bot/blog/double-clicking-on-toggleable-clinerules-self-improving-cline"
    accessed: "2026-08-10"
    kind: blog
    note: "A global rule prompts Cline to reflect on the session and propose .clinerules edits (diff blocks), applied only after the user approves."
  - id: aider-conventions
    title: "Specifying coding conventions"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/conventions.html"
    accessed: "2026-08-10"
    kind: docs
    note: "CONVENTIONS.md loaded read-only via --read / .aider.conf.yml; you edit it by hand — no auto-propose."
  - id: copilot-instructions
    title: "Adding repository custom instructions for GitHub Copilot"
    publisher: "GitHub docs"
    url: "https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot"
    accessed: "2026-08-10"
    kind: docs
    note: ".github/copilot-instructions.md; /init (chat) and copilot init (CLI) generate/refresh it from the codebase."
  - id: opencode-rules
    title: "Rules"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/rules/"
    accessed: "2026-08-10"
    kind: docs
    note: "/init scans the repo and creates or updates AGENTS.md; CLAUDE.md read as a fallback."
  - id: grok-rules
    title: "AGENTS.md — project rules"
    publisher: "xAI docs (Grok Build)"
    url: "https://docs.x.ai/build/features/project-rules"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Grok Build loads AGENTS.md every session and also reads CLAUDE.md and .claude/rules/. No documented reflect-and-propose step — treat updates as manual."
  - id: codex-agents
    title: "AGENTS.md for OpenAI Codex: Rules, Loading, and Templates"
    publisher: "Easton (eastondev.com)"
    url: "https://eastondev.com/blog/en/posts/ai/20260626-codex-agents-md-project-rules/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex will not update AGENTS.md from corrections unless explicitly asked; separate built-in memory preview (Apr 2026) is a different mechanism."
---

## What & why

The rules file (CLAUDE.md / AGENTS.md / `.cursor/rules` / CONVENTIONS.md) is loaded into every
prompt. When the agent has just worked something out — the right build command, a naming
convention, a gotcha in one module — or when you've just corrected it, that knowledge lives only in
the current conversation. Next session it re-derives the same thing or repeats the same mistake, and
you pay the output tokens (and the extra turns) again. Capturing the rule once, in the file that's
always loaded, stops the rework. A study of AGENTS.md files across 10 repositories and 124 pull
requests measured a **median 16.58% drop in output tokens** (and a 28.64% drop in runtime) when the
file was present, with comparable task completion.[^agents-md-study] The lever here is output tokens
and wasted turns, not the small input cost of the added lines.

## How to do it

The habit is: **when the agent solves something non-obvious, or you correct it, write that one rule
into the rules file** — so the next session starts already knowing it. Good triggers, from the
Claude Code docs, are concrete: the agent makes the same mistake a second time; a code review catches
something it should have known; you type the same correction you typed last session.[^cc-memory]

Keep it to durable facts (build/test commands, conventions, "always do X", module boundaries), not
one-off narration. Two mechanisms exist, and which you get depends on the tool:

1. **You capture it.** After a correction, add the rule yourself — a one-line edit, or a quick "add
   this to CLAUDE.md / AGENTS.md" to the agent. Works in every tool.
2. **The tool proposes it.** Some tools reflect on the session and offer the edit for you to approve.
   Cline has an explicit self-improving flow: it asks whether to reflect on the interaction, then
   proposes `.clinerules` changes as diffs and applies them only if you agree.[^cline-selfimprove]
   Cursor generates a rule from the current chat with `/create-rule`.[^cursor-rules] Copilot and
   OpenCode don't reflect on a correction, but their `/init` (and Copilot's `copilot init`) scans the
   codebase to generate or refresh the rules file — a bulk capture, not a per-correction one.[^copilot-instructions][^opencode-rules]
   Codex, Aider, and Grok Build don't auto-update at all — you (or the agent, on request) edit
   `AGENTS.md` / `CONVENTIONS.md`.[^codex-agents][^aider-conventions][^grok-rules]

A related but separate mechanism is **auto memory**: Claude Code and Codex keep a private notes file
the agent writes itself as it works, loaded each session.[^cc-memory][^codex-agents] That captures
learnings without you writing anything, but it's the agent's own scratchpad, not the team-shared,
version-controlled rules file — promote anything the whole team needs into the rules file.

This pairs with **keeping the rules file small**: every line is charged on every turn, so add rules
that pay for themselves and prune stale ones, or the file's input cost outgrows the rework it saves.
See this technique's row in `TOOL_MATRIX.md` for the exact file, command, and propose-vs-manual
behavior per tool.

## When it's worth it / when not

- **Worth it:** any repo the team works in repeatedly, and any convention the agent keeps getting
  wrong. The payoff compounds — one captured rule saves the same rework every future session.
- **Best candidates:** build/test invocation, project layout, library and style choices, and the
  specific mistakes you find yourself correcting more than once.
- **Not worth it:** truly one-off facts, or anything already discoverable from the codebase (the
  agent can re-derive it more cheaply than carrying a line for it every turn).
- **Careful with:** rules that will go stale fast. A wrong or outdated rule is worse than none — the
  agent follows it confidently and you pay to undo it.

## What it costs you

- **Input cost of the added lines.** Every rule is loaded on every turn. This is small per rule but
  unbounded if you never prune — the failure mode is a bloated rules file whose per-turn cost exceeds
  the rework it prevents. Cap the file and prune (see `context/keep-rules-file-small`).
- **Stale-rule risk.** A convention that changes and isn't updated actively misleads the agent.
  Review the file periodically and delete contradictions; conflicting rules make the agent pick one
  arbitrarily.[^cc-memory]
- **Setup effort is low.** Capturing a rule is a one-line edit or a one-sentence ask; the
  propose-and-approve flows (Cline, Cursor) add almost no overhead.

## How to verify

- Watch **output tokens and turns per task** on a recurring task type, before and after you start
  capturing rules — that's the lever this pulls, not input size. In Claude Code, `/context` shows
  what the rules file and memory currently cost; `ccusage` and OTel show output tokens per session.
- Sanity-check the file itself: is it growing with rules that earn their place, or with narration?
  If input-tokens-per-turn climbs without a matching drop in rework, prune.

## Measured impact

_Not yet measured by us._ Benchmark: run a repeated task on the same repo twice — a baseline with no
project-specific rules file, then the variant where a rule captured on the first run is present on
the second — and compare output tokens and turns per passing task. Cited so far: the AGENTS.md
efficiency study reports a **median 16.58% reduction in output tokens** (and 28.64% less runtime,
comparable completion) when the rules file is present, across 10 repos and 124 PRs.[^agents-md-study]
⚠ Single study, one agent — directional, not independently reproduced by us.

[^agents-md-study]: "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents", arXiv 2601.20404 — <https://arxiv.org/abs/2601.20404>
[^cc-memory]: Claude Code docs, "How Claude remembers your project" — <https://code.claude.com/docs/en/memory>
[^cursor-rules]: Cursor docs, "Rules" — <https://cursor.com/docs/context/rules>
[^cline-selfimprove]: Cline, "Double-clicking on toggleable .clinerules (+ self-improving Cline)" — <https://cline.bot/blog/double-clicking-on-toggleable-clinerules-self-improving-cline>
[^aider-conventions]: Aider docs, "Specifying coding conventions" — <https://aider.chat/docs/usage/conventions.html>
[^codex-agents]: Easton, "AGENTS.md for OpenAI Codex: Rules, Loading, and Templates" — <https://eastondev.com/blog/en/posts/ai/20260626-codex-agents-md-project-rules/>
[^copilot-instructions]: GitHub docs, "Adding repository custom instructions for GitHub Copilot" — <https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot>
[^opencode-rules]: OpenCode docs, "Rules" — <https://opencode.ai/docs/rules/>
[^grok-rules]: xAI docs (Grok Build), "AGENTS.md — project rules" — <https://docs.x.ai/build/features/project-rules>
