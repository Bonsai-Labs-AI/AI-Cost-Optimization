---
title: "MCP discipline: prune, prefer CLI, load on demand"
group: context
level: 1
costLever: [input]
effort: Low
savingEstimate: "large on heavy MCP setups (tens of thousands of tokens/turn)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - cline
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
  - id: anthropic-atu
    title: "Introducing advanced tool use on the Claude Developer Platform"
    publisher: "Anthropic Engineering"
    url: "https://www.anthropic.com/engineering/advanced-tool-use"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "5-server example = 58 tools ≈ 55K tokens before the conversation; ~134K seen internally before optimization; Tool Search cuts ~85% of that overhead; on-demand discovery via defer_loading."
  - id: cc-mcp
    title: "Connect Claude Code to tools via MCP"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/mcp"
    accessed: "2026-08-10"
    kind: docs
    note: "Tool search enabled by default (MCP tools deferred, discovered on demand); ENABLE_TOOL_SEARCH values; alwaysLoad exempts a server; .mcp.json project scope; disabledMcpjsonServers/enabledMcpjsonServers; MAX_MCP_OUTPUT_TOKENS default 25k."
  - id: usage-attr
    title: "Costs — /usage per-server attribution"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    note: "/usage attributes per-session token use to individual MCP servers as % of total, flagging any ≥10% of recent usage."
  - id: opencode-mcp
    title: "MCP servers"
    publisher: "OpenCode docs"
    url: "https://opencode.ai/docs/mcp-servers/"
    accessed: "2026-08-10"
    kind: docs
    note: "opencode.json `mcp` block; per-server `enabled: false`; `tools` glob (`my-mcp*: false`) and per-agent tool scoping."
  - id: copilot-mcp
    title: "Extending Copilot Chat with Model Context Protocol (MCP) servers"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp"
    accessed: "2026-08-10"
    kind: docs
    note: "`.vscode/mcp.json` (root key `servers`); toggle tools per-server from the Tools picker in Agent mode."
  - id: cursor-mcp
    title: "MCP servers in Cursor: setup, configuration, and security"
    publisher: "TrueFoundry"
    url: "https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "`.cursor/mcp.json` (project) / `~/.cursor/mcp.json` (global); Settings → Tools & MCP toggles servers and individual tools off."
  - id: cline-mcp
    title: "Add support for disabling specific MCP tools within a server"
    publisher: "cline/cline (discussion #8855)"
    url: "https://github.com/cline/cline/discussions/8855"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "`cline_mcp_settings.json` with per-server `\"disabled\": true`; disabling a server removes its definitions from the system prompt. No per-tool disable yet."
---

## What & why

Every connected MCP server hands the model a block of tool schemas — names, descriptions, and
parameter definitions — and by default that block is loaded into context. Anthropic's own example
is a five-server setup (GitHub, Slack, Sentry, Grafana, Splunk) that totals **58 tools ≈ 55K tokens
before the conversation even starts**; internally they saw tool definitions reach **134K tokens
before optimization**.[^anthropic-atu] MCP discipline is keeping that footprint small: connect only
the servers a repo needs, prefer plain CLI tools where a CLI does the job, and let the harness defer
tool definitions until they're actually used. The lever is input tokens / context.

## How to do it

Three moves, cheapest first:

1. **Prune to what the repo needs.** Don't connect every server globally. Scope servers per project
   (a committed project-level MCP file the team shares) and allowlist them, so a repo loads its
   database and issue-tracker servers and nothing else. Fewer connected servers means fewer schemas
   in context. Most harnesses also let you toggle an unused server off without deleting its config —
   Cursor's Settings → Tools & MCP,[^cursor-mcp] Copilot's Tools picker in Agent mode,[^copilot-mcp]
   OpenCode's per-server `enabled: false`,[^opencode-mcp] and Cline's `"disabled": true`.[^cline-mcp]

2. **Prefer a CLI over a fat MCP schema.** For anything with a good command-line tool — `gh`, `git`,
   `aws`, `gcloud`, `kubectl` — the agent can just run the command through its normal shell tool. A
   CLI adds **no per-tool schema** to context, whereas the equivalent MCP server (GitHub's is ~35
   tools) can add tens of thousands of tokens.[^anthropic-atu] Reserve MCP for systems that have no
   usable CLI, or where structured tool calls genuinely beat shelling out.

3. **Load tool definitions on demand — don't disable it.** Current Claude Code defers MCP tool
   definitions by default: only tool names and short server instructions load at startup, and the
   model searches for a tool's full schema when a task needs it. Anthropic reports this cuts about
   **85%** of the tool-definition overhead.[^anthropic-atu][^cc-mcp] Leave it on. Turning it off
   (`ENABLE_TOOL_SEARCH=false`) puts every schema back into every turn — the exact cost this
   technique avoids. If you need a specific server visible on every turn, exempt just that one rather
   than disabling deferral globally.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool file, flag, and toggle.

## When it's worth it / when not

- **Worth it:** any team running more than one or two MCP servers, and especially anyone who added
  servers globally "to have them around." The cost scales with the number of connected tools, so a
  heavy setup is where the tokens are.
- **Prefer CLI when:** a mature command-line tool already covers the task (Git, GitHub, cloud
  providers, Kubernetes). The agent knows these commands and they cost nothing to have available.
- **Keep the MCP server when:** there's no usable CLI (many SaaS and internal systems), or you want
  structured results, scoped auth, and audit that a raw shell command doesn't give you. Discipline is
  about pruning the ones you don't use, not banning MCP.
- **Not the lever if** you already run zero or one small server — there's little to trim, so spend the
  effort elsewhere.

## What it costs you

- **Setup effort is Low** — it's editing a config file and toggling servers off, not building
  anything.
- **The failure mode is over-pruning:** remove a server the agent actually needs and it stalls or
  works around the gap, which can cost more than the schema you saved. Prune based on what a repo
  uses, not a blanket rule.
- **CLI is not free of risk** — a shell command has broader blast radius than a scoped MCP tool. Keep
  a server (or permission rules) where scoped, auditable access matters more than the token saving.
- **Don't disable on-demand loading to "make tools reliable."** It trades a large, permanent
  per-turn cost for a small convenience; leave deferral on and exempt individual servers only when
  one is needed every turn.

## How to verify

- In Claude Code, `/usage` attributes per-session token use to individual MCP servers as a share of
  the total and flags any server that's ≥10% of recent usage — that list tells you which servers to
  prune first.[^usage-attr] `/context` shows the startup footprint.
- Compare input tokens per turn on the same task before and after pruning and before/after confirming
  on-demand loading is on. The saving shows up as a smaller fixed cost on every turn, not on any one
  action.

## Measured impact

_Not yet measured by us._ Benchmark: run the same task on one repo with a heavy MCP setup (several
servers loaded upfront) versus the disciplined variant (pruned to the servers the repo needs, CLI
preferred where it fits, on-demand loading left on), and compare input tokens per turn and cost per
passing task. Cited so far: Anthropic's five-server example is **58 tools ≈ 55K tokens** of
definitions before a prompt is typed, with tool definitions reaching **~134K tokens** internally
before optimization, and on-demand tool search cutting roughly **85%** of that overhead.[^anthropic-atu]
⚠ These are vendor figures for one example configuration, not independently verified, and the exact
token count depends on which servers you connect.

[^anthropic-atu]: Anthropic Engineering, "Introducing advanced tool use on the Claude Developer Platform" — <https://www.anthropic.com/engineering/advanced-tool-use>
[^cc-mcp]: Claude Code docs, "Connect Claude Code to tools via MCP" — <https://code.claude.com/docs/en/mcp>
[^usage-attr]: Claude Code docs, "Costs" (`/usage` per-server attribution) — <https://code.claude.com/docs/en/costs>
[^cursor-mcp]: TrueFoundry, "MCP servers in Cursor: setup, configuration, and security" — <https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide>
[^copilot-mcp]: GitHub Docs, "Extending Copilot Chat with Model Context Protocol (MCP) servers" — <https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp>
[^opencode-mcp]: OpenCode docs, "MCP servers" — <https://opencode.ai/docs/mcp-servers/>
[^cline-mcp]: cline/cline, "Add support for disabling specific MCP tools within a server" (discussion #8855) — <https://github.com/cline/cline/discussions/8855>
