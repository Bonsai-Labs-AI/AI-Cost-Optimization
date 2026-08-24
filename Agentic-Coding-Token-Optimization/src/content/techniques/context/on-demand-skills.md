---
title: "Move detail into on-demand skills"
group: context
level: 2
costLever: [input]
effort: Low
savingEstimate: "varies — proportional to the detail you move out of the always-on files"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
  - codex
  - copilot
  - opencode
  - grok-build
  - aider
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/keep-rules-file-small"
  - "context/tool-output-filtering"
sources:
  - id: agentskills
    title: "Agent Skills — overview and progressive disclosure"
    publisher: "agentskills.io (open standard, originated by Anthropic)"
    url: "https://agentskills.io"
    accessed: "2026-08-10"
    kind: docs
    note: "Three-stage progressive disclosure: at startup agents load only each skill's name and description; the full SKILL.md loads when a task matches; referenced files load only when needed."
  - id: cc-skills
    title: "Extend Claude with skills"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/skills"
    accessed: "2026-08-10"
    kind: docs
    note: "Descriptions load into context so Claude knows what's available; full body loads only when invoked. description + when_to_use truncated at 1,536 chars in the listing. disable-model-invocation:true keeps the description out of context. Once loaded, the body stays in context all session (recurring cost)."
  - id: cc-rules-small
    title: "Context engineering — keep CLAUDE.md under ~200 lines; move detail into on-demand skills"
    publisher: "Bonsai Labs RESEARCH_FINDINGS.md (verified 3-0), sourcing Claude Code best-practices docs"
    url: "https://code.claude.com/docs/en/best-practices"
    accessed: "2026-08-10"
    kind: docs
    note: "Reused from RESEARCH_FINDINGS.md P4. Best-practices docs: keep CLAUDE.md concise (ask of each line whether removing it would cause mistakes); move domain knowledge and situational workflows into on-demand skills rather than bloating every conversation."
  - id: cursor-rules
    title: "Rules — rule types and how each loads"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/rules"
    accessed: "2026-08-10"
    kind: docs
    note: "'Apply Intelligently' (Agent Requested): the agent reads only the description and loads the full .mdc rule when it decides it's relevant. Glob-scoped rules attach only on matching files."
  - id: cursor-skills
    title: "Skills"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/context/skills"
    accessed: "2026-08-10"
    kind: docs
    note: "Cursor added SKILL.md support (project-level .cursor/skills/ or .agents/skills/) in v2.4; skills are discovered automatically and applied by relevance, or invoked with /skill-name, with disable-model-invocation:true to suppress auto-invocation."
  - id: codex-skills
    title: "Build skills (Codex CLI)"
    publisher: "OpenAI / ChatGPT docs"
    url: "https://learn.chatgpt.com/docs/build-skills"
    accessed: "2026-08-10"
    kind: docs
    note: "Codex scans .agents/skills/ up to the repo root; starts with each skill's name+description and loads the full SKILL.md on use. The skills list is capped at ~2% of the context window (or 8,000 chars)."
  - id: copilot-skills
    title: "About Agent Skills"
    publisher: "GitHub Copilot docs"
    url: "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills"
    accessed: "2026-08-10"
    kind: docs
    note: "Copilot loads agent skills (folders of instructions/scripts/resources) from project dirs .github/skills/, .claude/skills/, .agents/skills/ and personal dirs ~/.copilot/skills, ~/.agents/skills when relevant; the shared open Agent Skills standard. Also supports path-scoped .github/instructions/*.instructions.md via applyTo frontmatter."
  - id: cline-rules
    title: "Rules — toggleable and conditional loading"
    publisher: "Cline docs"
    url: "https://docs.cline.bot/customization/cline-rules"
    accessed: "2026-08-10"
    kind: docs
    note: "Unconditional .clinerules load every request; conditional rules load on-demand. Every rule has an on/off toggle. Roo Skills documented at docs.roocode.com/features/skills."
  - id: aider-conventions
    title: "Specifying coding conventions"
    publisher: "Aider docs"
    url: "https://aider.chat/docs/usage/conventions.html"
    accessed: "2026-08-10"
    kind: docs
    note: "Aider has no skills mechanism; the equivalent is /read to add reference files on demand rather than pinning them read-only every session."
---

## What & why

The name-and-description of every skill (and every always-on rules file) is added to the prompt on
every turn, so situational detail that only matters occasionally is charged the whole session. The
Agent Skills standard is built around **progressive disclosure**: at startup the agent loads only
each skill's name and short description; the full `SKILL.md` body loads only when a task matches, and
any files that body references load later still.[^agentskills] Moving situational instructions out of
the always-on rules file and into skills means you pay for the detail only in the sessions that use
it — an input-token saving proportional to how much you move out.

## How to do it

The portable move is the same across tools — even editors that started with only rules files have
since added `SKILL.md` support (Cursor added it in v2.4).[^cursor-skills]

1. **Split standing facts from situational procedures.** Keep the small set of always-true
   conventions in the rules file (see [Keep the rules file small](keep-rules-file-small.md)); the
   guidance to keep the always-on file small and push detail into on-demand skills comes straight
   from the tool docs.[^cc-rules-small] Move
   anything that applies only to a subsystem, a task type, or a rare workflow — the migration
   checklist, the release steps, the "how our auth layer works" explainer — into a skill or a
   referenced doc that loads on trigger.
2. **Write a tight description.** The description is the only part that loads every session, and it's
   what the agent matches against to decide whether to pull the body. Say what the skill does and
   when to use it, in one or two lines. Codex, for example, caps the whole skills listing at about 2%
   of the context window before it truncates.[^codex-skills]
3. **Keep the body itself lean, and push bulk into referenced files.** Large reference material lives
   beside `SKILL.md` and loads only when the body points the agent to it — so a long spec costs
   nothing until it's opened.[^agentskills] Note that in Claude Code, once a skill's body loads it
   stays in context for the rest of the session, so an over-long body is a recurring cost, not a
   one-off.[^cc-skills]
4. **Prune unused skills.** Every skill's description loads every session whether or not it's ever
   triggered. A drawer full of stale skills is a standing tax on the context window; delete the ones
   the team no longer uses. In Claude Code you can also set `disable-model-invocation: true`, which
   keeps a skill's description out of context entirely (you invoke it only by name).[^cc-skills]

See this technique's row in `TOOL_MATRIX.md` for the exact directory and mechanism per tool.

## When it's worth it / when not

- **Worth it:** any repo where the rules file has grown past standing facts into procedures, or where
  different tasks need different context (front-end vs infra vs data). This is where "move detail into
  a skill" directly trims the always-on prompt.
- **Worth it:** teams standardizing repeatable-but-situational workflows (release notes, migration
  checklists, incident summaries) — skills package them once and load them only on demand.
- **Not worth it as pure token savings** for detail the agent needs on *every* turn: moving a
  genuinely always-relevant convention into a skill just adds a trigger step and can cost more if the
  agent re-derives it. Keep those in the rules file.
- **Not applicable** to tools without a skills or conditional-rules mechanism. Where a tool offers
  conditional rules instead of skills — Cline, for instance, loads unconditional `.clinerules` every
  request but scopes conditional rules to matching files, with an on/off toggle per rule — use that
  as the equivalent lever.[^cline-rules] Aider has no skills system at all; the nearest equivalent is
  adding reference files with `/read` on demand instead of pinning them every session.[^aider-conventions]

## What it costs you

- **Setup effort is Low:** it's mostly cutting sections out of a rules file into `SKILL.md` files.
- **The main failure mode is a mis-tuned description** — too vague and the agent never triggers the
  skill (so it works without the guidance and produces worse output); too broad and it loads bodies
  you didn't need. Cursor's "Apply Intelligently" rules fail exactly this way: with no usable
  description the rule silently never fires.[^cursor-rules]
- **Skill sprawl is a quiet tax.** Descriptions all load every session, so a large unpruned skill set
  erodes the very context budget this technique is meant to protect. Prune on a schedule.
- **Quality risk is Low** as long as anything the team genuinely relies on gets moved into a skill
  rather than deleted.

## How to verify

- Watch input tokens (or tokens-per-turn) on a representative session before and after moving detail
  out of the rules file. In Claude Code, `/context` shows the rules file and per-skill footprint, and
  `/usage` attributes usage to individual skills so you can see which descriptions are earning their
  place.
- Confirm the moved skill still triggers when it should: run a task that needs it and check the tool
  reports the skill loaded (Claude Code notes it in context; Cursor surfaces the rules pulled into the
  turn).[^cursor-rules]

## Measured impact

_Not yet measured by us._ Benchmark: run the same tasks on one repo in two configurations — a baseline
with all situational detail inlined in the always-on rules file, versus a variant that moves that
detail into on-demand skills and prunes unused ones — and compare input tokens and cost per passing
task. The saving is expected to scale with how much detail moves out of the always-on files and how
often it's actually needed. ⚠ No independent before/after number exists yet for this specific split;
the mechanism (progressive disclosure — only name+description loaded at startup) is confirmed in the
Agent Skills standard and in the Claude Code, Codex, Cursor, and Copilot docs.[^agentskills][^cc-skills][^codex-skills][^cursor-rules][^copilot-skills]

[^agentskills]: Agent Skills, "Overview" — <https://agentskills.io>
[^cc-skills]: Claude Code docs, "Extend Claude with skills" — <https://code.claude.com/docs/en/skills>
[^cc-rules-small]: Claude Code docs, "Best practices" (keep CLAUDE.md concise; move domain knowledge and workflows into skills) — <https://code.claude.com/docs/en/best-practices>
[^cursor-rules]: Cursor docs, "Rules" — <https://cursor.com/docs/context/rules>
[^cursor-skills]: Cursor docs, "Skills" — <https://cursor.com/docs/context/skills>
[^codex-skills]: OpenAI / ChatGPT docs, "Build skills" — <https://learn.chatgpt.com/docs/build-skills>
[^copilot-skills]: GitHub Copilot docs, "About Agent Skills" — <https://docs.github.com/en/copilot/concepts/agents/about-agent-skills>
[^cline-rules]: Cline docs, "Rules" — <https://docs.cline.bot/customization/cline-rules>
[^aider-conventions]: Aider docs, "Specifying coding conventions" — <https://aider.chat/docs/usage/conventions.html>
