---
title: "Keep the rules file small (and scoped)"
group: context
level: 1
costLever: [input]
effort: Low
savingEstimate: "large on a bloated file; small on a lean one"
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
sources:
  - id: karaca
    title: "My CLAUDE.md Was Eating 42,000 Tokens Per Conversation — Here's How I Fixed It"
    publisher: "Cem Karaca (Medium)"
    url: "https://medium.com/@cem.karaca/my-claude-md-was-eating-42-000-tokens-per-conversation-heres-how-i-fixed-it-85ffba809bd4"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "1,207-line CLAUDE.md = ~42,200 tokens/conversation; trimmed to a lean file + skills for ~94% reduction (to ~2,400 tokens). Practitioner-sourced — link-check."
  - id: cc-memory
    title: "How Claude remembers your project (memory)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/memory"
    accessed: "2026-08-10"
    kind: docs
    note: "Target CLAUDE.md under 200 lines; nested files load on demand; .claude/rules/ with paths: frontmatter globs; /context shows memory-file tokens; /doctor proposes trims."
  - id: cursor-rules
    title: "Rules"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/rules"
    accessed: "2026-08-10"
    kind: docs
    note: ".cursor/rules/*.mdc with globs + alwaysApply frontmatter; nested AGENTS.md per subdirectory; four rule types (Always / Apply Intelligently / glob-matched / manual)."
  - id: cline-rules
    title: "Cline Rules"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/features/cline-rules"
    accessed: "2026-08-10"
    kind: docs
    note: ".clinerules/ folder combines .md/.txt files; paths: frontmatter scopes a rule to matching files; UI toggles per rule."
  - id: aider-conventions
    title: "Specifying coding conventions"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/conventions.html"
    accessed: "2026-08-10"
    kind: docs
    note: "CONVENTIONS.md loaded via --read / /read (read-only, cached); or read: in .aider.conf.yml."
  - id: copilot-instructions
    title: "Adding repository custom instructions for GitHub Copilot"
    publisher: "GitHub docs"
    url: "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions"
    accessed: "2026-08-10"
    kind: docs
    note: ".github/copilot-instructions.md (repo-wide, added to every request); .github/instructions/*.instructions.md with applyTo globs; guidance: no longer than 2 pages, not task-specific."
  - id: agents-md
    title: "AGENTS.md"
    publisher: "agents.md"
    url: "https://agents.md/"
    accessed: "2026-08-10"
    kind: docs
    note: "Nested AGENTS.md supported; agents read the nearest file in the tree (closest wins). Read by Codex, OpenCode, Gemini CLI, Aider, and others."
---

## What & why

The rules file — `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`, `.clinerules/`, `CONVENTIONS.md`,
`.github/copilot-instructions.md` — is loaded into context at the start of every session and re-sent
on every turn. Every line you put there is charged on every conversation, whether or not the current
task touches that part of the codebase. Keeping the file short and scoping detail to where it applies
cuts input tokens across the whole session, and it also improves adherence: shorter, well-structured
instructions are followed more reliably than a long wall of rules.[^cc-memory] The lever is input
tokens; the mechanism is "load less, every turn."

## How to do it

Four moves, in order of payoff:

1. **Cap the file.** Keep the always-loaded rules file to the essentials — build/test commands,
   conventions that differ from tool defaults, project layout, "always do X" rules. Claude Code's docs
   put the target at **under ~200 lines**; longer files cost more and reduce adherence.[^cc-memory]
   Copilot's guidance is similar: instructions "no longer than 2 pages" and not task-specific.[^copilot-instructions]
2. **Prune stale rules.** Rules for a framework you've dropped, or a convention two refactors out of
   date, are pure overhead — and contradictory rules make the agent pick one arbitrarily. Review
   periodically and delete. (Claude Code's `/doctor` will propose trims: it cuts what the agent can
   re-derive from the codebase — directory layouts, dependency lists — and keeps pitfalls and
   conventions.)[^cc-memory]
3. **Move detail out, don't delete it.** Long or situational content — a multi-step release procedure,
   a subsystem's quirks — belongs in an on-demand mechanism (a skill, a referenced doc), not in the
   always-loaded file. You keep the knowledge but stop paying for it every turn. One practitioner cut a
   1,207-line `CLAUDE.md` (~42,200 tokens/conversation) to a lean file plus skills and reported ~94%
   fewer baseline context tokens.[^karaca]
4. **Scope rules per-directory or per-glob.** Subsystem detail should load only when the agent touches
   that subsystem. Most tools support this: nested rules files that load on demand (a `CLAUDE.md` or
   `AGENTS.md` in a subdirectory), or path/glob frontmatter that attaches a rule only to matching files.
   A monorepo's `frontend/` rules then cost nothing while the agent works in `backend/`.

Note one gotcha for the "move detail out" step in Claude Code: `@import` splits a file for
*organization*, but imported files still load in full at launch — they don't reduce context. Use
skills or path-scoped rules to actually defer loading.[^cc-memory]

For the exact file name, frontmatter, and scoping mechanism per tool, see this technique's row in
`TOOL_MATRIX.md`. In short: Claude Code uses `CLAUDE.md` + `.claude/rules/` with `paths:` globs and
loads nested subdirectory files on demand;[^cc-memory] Cursor uses `.cursor/rules/*.mdc` with `globs`
and `alwaysApply`;[^cursor-rules] Cline uses a `.clinerules/` folder with per-rule `paths:` frontmatter
and UI toggles;[^cline-rules] Aider loads a read-only, cached `CONVENTIONS.md` via `--read`;[^aider-conventions]
Copilot pairs `.github/copilot-instructions.md` with path-specific `.github/instructions/*.instructions.md`
(`applyTo` globs);[^copilot-instructions] and Codex, OpenCode, and Grok Build read `AGENTS.md`, using the
nearest file in the tree for nested scope.[^agents-md]

## When it's worth it / when not

- **Worth it — capping and pruning:** always. It's a zero-regret default; a bloated file costs tokens
  every turn and dilutes attention.
- **Worth it — scoping:** most valuable in monorepos and large repos with distinct subsystems, where
  per-directory rules keep the always-on file tiny and load subsystem detail only in that subtree.
- **Diminishing returns:** if your rules file is already ~200 lines / a few hundred tokens, the absolute
  saving is small — this is a big win only when the file is genuinely bloated.
- **Not worth it — over-trimming:** don't cut a convention the team relies on down to nothing. If the
  agent has to re-derive project conventions each session (re-reading files, guessing patterns, redoing
  work a reviewer rejects), that costs more than the lines you saved. Move it to a skill or a scoped
  rule, don't delete it.

## What it costs you

- **Setup effort: Low.** Trimming and pruning is editing one file. Scoping is a bit more: splitting
  rules across directories or adding glob frontmatter, and deciding what belongs where.
- **Quality risk: Low, with one failure mode** — cutting a rule the team actually depends on. Symptoms:
  the agent reverts a convention, or a reviewer keeps flagging the same thing. Fix by relocating the rule
  (skill / scoped rule), not by pasting it back into the always-loaded file.
- **A subtler risk with scoping:** a per-directory rule that never triggers because the agent works from
  the repo root, or a glob that's too narrow. Verify that scoped rules actually load when expected —
  Claude Code's `/context` and the `InstructionsLoaded` hook show which instruction files are live.[^cc-memory]

## How to verify

- **Measure the rules file's token cost directly.** In Claude Code, `/context` lists memory files and
  their token count — that number is what you pay per conversation before any work happens. Trim, then
  re-check.[^cc-memory]
- **Watch input tokens per turn** on a representative session before and after. `ccusage` and Claude
  Code's OpenTelemetry export both break out input tokens so you can see the baseline drop.
- **Confirm scoped rules load only where intended:** open a file in the target subtree and check that
  its rule appears (via `/context`, or the `InstructionsLoaded` hook);[^cc-memory] confirm it's absent
  when you work elsewhere.

## Measured impact

_Not yet measured by us._ Benchmark: run the same task set on one repo with (a) a lean, scoped rules
file versus (b) a deliberately bloated single rules file, and compare input tokens per turn and cost per
passing task; the two arms are the baseline lean-file variant and the bloated-file variant (arm codes
TBD). Cited so far: one practitioner reduced a 1,207-line `CLAUDE.md` (~42,200 tokens loaded every
conversation) to a lean file plus on-demand skills and reported ~94% fewer baseline context tokens
(down to ~2,400).[^karaca] ⚠ This is a single practitioner's self-reported figure on one repo, not
independently verified; the absolute saving depends entirely on how bloated the starting file was — a
file that's already lean has little to give.

[^karaca]: Cem Karaca, "My CLAUDE.md Was Eating 42,000 Tokens Per Conversation — Here's How I Fixed It" — <https://medium.com/@cem.karaca/my-claude-md-was-eating-42-000-tokens-per-conversation-heres-how-i-fixed-it-85ffba809bd4>
[^cc-memory]: Claude Code docs, "How Claude remembers your project (memory)" — <https://code.claude.com/docs/en/memory>
[^cursor-rules]: Cursor docs, "Rules" — <https://cursor.com/docs/context/rules>
[^cline-rules]: Cline docs, "Cline Rules" — <https://docs.cline.bot/features/cline-rules>
[^aider-conventions]: Aider docs, "Specifying coding conventions" — <https://aider.chat/docs/usage/conventions.html>
[^copilot-instructions]: GitHub docs, "Adding repository custom instructions for GitHub Copilot" — <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions>
[^agents-md]: agents.md, "AGENTS.md" — <https://agents.md/>
