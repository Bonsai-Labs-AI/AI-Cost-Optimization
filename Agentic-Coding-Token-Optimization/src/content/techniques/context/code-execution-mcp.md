---
title: "Code-execution / \"code mode\" MCP"
group: context
level: 3
costLever: [input]
effort: High
savingEstimate: "large on MCP-heavy work (varies)"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - claude-code
  - cursor
  - cline
  - codex
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "context/tool-output-filtering"
  - "context/keep-rules-file-small"
sources:
  - id: anthropic-code-exec
    title: "Code execution with MCP: building more efficient AI agents"
    publisher: "Anthropic Engineering"
    url: "https://www.anthropic.com/engineering/code-execution-with-mcp"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "150k -> 2k tokens (98.7%) on tool-definition loading; intermediate results stay in the execution environment; a 2-hour transcript passed through the model twice = ~50k extra tokens."
  - id: anthropic-advanced-tool-use
    title: "Introducing advanced tool use on the Claude Developer Platform"
    publisher: "Anthropic Engineering"
    url: "https://www.anthropic.com/engineering/advanced-tool-use"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Programmatic Tool Calling: 37% token reduction on complex research tasks (avg 43,588 -> 27,297 tokens)."
  - id: ptc-docs
    title: "Programmatic tool calling"
    publisher: "Claude Platform Docs"
    url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling"
    accessed: "2026-08-10"
    kind: docs
    note: "API beta. Enable code execution tool + allowed_callers: [\"code_execution_20260120\"] on the tool; requires code_execution_20260120 or later. Not on Bedrock/Vertex."
  - id: cc-issue-33761
    title: "support programmatic tool calling (issue #33761)"
    publisher: "anthropics/claude-code"
    url: "https://github.com/anthropics/claude-code/issues/33761"
    accessed: "2026-08-10"
    kind: repo
    note: "Closed as not planned — Claude Code does not expose native Programmatic Tool Calling; the API feature is not wired into the CLI."
  - id: cc-issue-12836
    title: "Support Tool Search and Programmatic Tool Use betas for reduced token consumption (issue #12836)"
    publisher: "anthropics/claude-code"
    url: "https://github.com/anthropics/claude-code/issues/12836"
    accessed: "2026-08-10"
    kind: repo
    note: "Closed. Tool Search (deferred tool definitions) shipped in Claude Code; the Programmatic Tool Calling half did not."
  - id: utcp-code-mode
    title: "code-mode — call MCP/UTCP tools via code execution"
    publisher: "universal-tool-calling-protocol (GitHub)"
    url: "https://github.com/universal-tool-calling-protocol/code-mode"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Third-party library/CLI. For shell-capable agents (Claude Code, Cursor, Codex) the utcp CLI drives tool-chains from the shell, no MCP client config; TypeScript (Node VM sandbox) + Python."
---

## What & why

When an agent uses MCP servers the traditional way, two things eat input tokens: every tool's
definition is loaded up front, and every intermediate result — a fetched document, a query dump, a
transcript — passes through the model's context on its way to the next tool. "Code mode" turns MCP
tools into functions the agent calls from a short script instead. The tool definitions are read on
demand, and large intermediate results stay in the execution environment; only what the code
explicitly logs or returns enters the transcript.[^anthropic-code-exec] The lever is input tokens on
MCP traffic — both the standing tool-definition overhead and the per-step intermediate data.

## How to do it

The portable idea is to **stop passing MCP data through the model and route it through code**. Two
mechanisms exist, at different levels of maturity:

1. **Programmatic Tool Calling (the managed version).** On the Claude API, enable the code execution
   tool and mark each tool `allowed_callers: ["code_execution_20260120"]`. The model then writes a
   script that calls those tools, filters their output, and returns only the reasoned-over
   result.[^ptc-docs] This is an **API beta**, not something the off-the-shelf CLIs expose yet — see
   the maturity note below.

2. **Tools-as-code on a filesystem (the do-it-yourself version).** Present each MCP tool as a small
   typed function in a directory tree (e.g. `./servers/google-drive/getDocument.ts`), and let the
   agent discover them by listing the folder and reading only the files it needs, rather than loading
   every definition up front.[^anthropic-code-exec] The agent writes a script that chains the calls,
   filters in code (return five rows, not ten thousand), and can persist reusable scripts as skills.
   For agents that can run a shell — Claude Code, Cursor, Codex — a third-party CLI such as
   `code-mode`/`utcp` provides this without wiring up an MCP client: the agent writes a config and
   drives tool-chains from the shell.[^utcp-code-mode]

Two adjacent, more-available levers do part of the same job and are worth doing first because they
carry less risk: **defer tool definitions** so unused MCP tools don't load until searched for (Claude
Code's Tool Search, shipped[^cc-issue-12836]), and **prefer plain CLI tools** (`gh`, `aws`, `gcloud`)
over MCP servers for anything the agent already runs from a shell.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool mechanism.

## When it's worth it / when not

- **Worth it:** MCP-heavy workflows where large payloads move between tools — pulling a long document
  or transcript and writing it somewhere else, aggregating many queries, or looping a tool over a
  list. Anthropic's example of a 2-hour meeting transcript notes it can add ~50,000 tokens by passing
  through the model twice; keeping it in code avoids that.[^anthropic-code-exec] Also worth it when
  you have many MCP tools whose definitions dominate the context budget.
- **Marginal:** a handful of MCP tools with small results. The tool-definition and intermediate-data
  savings are small, and the setup and quality risk aren't justified.
- **Not worth it:** if you barely use MCP. Plain CLI tools and a small rules file get you most of the
  context savings with none of this complexity.

## What it costs you

- **Maturity gap.** The clean, managed form (Programmatic Tool Calling) is a Claude **API** beta, not
  a native feature of Claude Code, Cursor, or the other CLIs. The Claude Code request for it was
  **closed as not planned**.[^cc-issue-33761] In an off-the-shelf CLI today you get code mode either
  through the tools-as-code pattern or a third-party library, both of which are setup you own — hence
  High effort. This is an emerging technique; treat it as one to watch and pilot, not a default.
- **A new execution surface.** You're now letting the agent run code that calls your tools. That code
  runs in a sandbox, but it's still more attack surface and more to sandbox and review than plain tool
  calls — a real security and quality consideration for a leadership audience.
- **Quality risk from over-filtering.** The savings come from the code returning only a slice of the
  data. If the script filters out the field the agent needed, it re-runs — the same failure mode as
  output filtering, so keep the returned slice generous when unsure.
- **Model and platform limits.** Programmatic Tool Calling needs `code_execution_20260120` or later
  and is not available on Amazon Bedrock or Google Cloud.[^ptc-docs] If you route the agent to a
  non-Claude or open-weight model through a gateway, this managed path may not exist at all.

## How to verify

- Compare input tokens (and tokens-per-turn) on an MCP-heavy task run the old way vs. through code
  mode — the gap should show up as fewer input tokens, concentrated on the steps that used to carry
  large payloads.
- Watch the tool-definition share of context (Claude Code `/context` and `/usage` break down MCP
  servers as a percentage of usage); deferring definitions should shrink it before code mode is even
  in play.
- Confirm the same tasks still pass. Because the win depends on filtering in code, track cost per
  passing task, not tokens alone, so an over-trimmed script that triggers re-runs shows up.

## Measured impact

_Not yet measured by us._ Benchmark: run the same MCP-heavy task (fetch-and-write a large document,
or aggregate many queries) two ways on the same repo — a baseline that passes intermediate results
through the model, and a variant that calls the tools from code and returns only the filtered result
— and compare input tokens and cost per passing task. Cited so far, all vendor-reported: Anthropic
reports **150,000 -> 2,000 tokens (98.7%)** on the tool-definition-loading example, and that a 2-hour
transcript can add ~50,000 tokens by passing through the model twice;[^anthropic-code-exec]
Programmatic Tool Calling reports a **37% token reduction on complex research tasks** (average 43,588
-> 27,297 tokens).[^anthropic-advanced-tool-use] ⚠ Both are Anthropic's own figures on chosen
examples, not independently verified, and the 98.7% is a best-case tool-definition scenario rather
than a typical whole-session saving.

[^anthropic-code-exec]: Anthropic Engineering, "Code execution with MCP: building more efficient AI agents" — <https://www.anthropic.com/engineering/code-execution-with-mcp>
[^anthropic-advanced-tool-use]: Anthropic Engineering, "Introducing advanced tool use on the Claude Developer Platform" — <https://www.anthropic.com/engineering/advanced-tool-use>
[^ptc-docs]: Claude Platform Docs, "Programmatic tool calling" — <https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling>
[^cc-issue-33761]: anthropics/claude-code, issue #33761 — <https://github.com/anthropics/claude-code/issues/33761>
[^cc-issue-12836]: anthropics/claude-code, issue #12836 — <https://github.com/anthropics/claude-code/issues/12836>
[^utcp-code-mode]: universal-tool-calling-protocol/code-mode — <https://github.com/universal-tool-calling-protocol/code-mode>
