---
title: "Browser/vision token discipline"
group: context
level: 2
costLever: [input]
effort: Medium
savingEstimate: "~4x on browser-loop tokens (vision path)"
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
  - "context/tool-output-filtering"
  - "context/targeted-context-not-repo-dumps"
sources:
  - id: pw-mcp-readme
    title: "Playwright MCP — README"
    publisher: "microsoft/playwright-mcp"
    url: "https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md"
    accessed: "2026-08-10"
    kind: repo
    note: "Default is accessibility snapshot (browser_snapshot); vision/screenshot tools are opt-in via --caps=vision; --image-responses=allow|omit controls whether images are sent to the client (default allow); browser_take_screenshot is the screenshot tool. Run via npx @playwright/mcp@latest."
  - id: pw-cli-intro
    title: "Playwright agent CLI — Introduction"
    publisher: "Playwright docs"
    url: "https://playwright.dev/agent-cli/introduction"
    accessed: "2026-08-10"
    kind: docs
    note: "Positions the CLI as token-efficient vs MCP: 'concise CLI output avoids loading large tool schemas into the model context'; MCP keeps 'tool schemas + snapshots in context'. State lives on disk, not in the context window. Install: npm install -g @playwright/cli."
  - id: testcollab-cli
    title: "Playwright CLI: the token-efficient alternative to Playwright MCP for AI coding agents"
    publisher: "TestCollab"
    url: "https://testcollab.com/blog/playwright-cli"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Quotes the Playwright team's own benchmark: a typical browser-automation task ~114,000 tokens with MCP vs ~27,000 with CLI (~4x). Attribution given as 'Playwright team's own benchmarks'; no primary link in the post. Practitioner-sourced — link-check the number against a Playwright primary source before publishing."
  - id: anthropic-vision
    title: "Vision — image limits, resolution, and token cost"
    publisher: "Claude Platform docs"
    url: "https://platform.claude.com/docs/en/build-with-claude/vision"
    accessed: "2026-08-10"
    kind: docs
    note: "Image cost = ceil(width/28) x ceil(height/28) visual tokens. Claude downscales large images: max ~1,568 visual tokens (standard tier) / ~4,784 (high-res, Claude 4.7+). Base64 images re-sent every turn in multi-turn/agentic loops unless referenced via Files API by file_id; guidance is to downsample/crop before sending."
  - id: pw-mcp-issue-915
    title: "Optimize browser_snapshot tool (issue #915)"
    publisher: "microsoft/playwright-mcp"
    url: "https://github.com/microsoft/playwright-mcp/issues/915"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Open request: full-page accessibility snapshot returns the entire tree and hits token limits 'within 5-10 steps'. Confirms full snapshots are a token problem; a native trim-to-interactable / incremental mode is not yet default in official playwright-mcp."
  - id: fast-pw-mcp
    title: "fast-playwright-mcp — incremental snapshots and response filtering"
    publisher: "tontoko/fast-playwright-mcp"
    url: "https://github.com/tontoko/fast-playwright-mcp"
    accessed: "2026-08-10"
    kind: repo
    verify: true
    note: "Community fork: incremental/diff snapshots (send only what changed since last snapshot) and per-call expectation params (includeSnapshot:false, includeCode:false) for minimal responses. Claims large token reductions; not the official Microsoft server — verify current behavior and maintenance before recommending."
---

## What & why

Frontend and end-to-end agent loops drive a real browser, and the way the page comes back into
context decides the token bill. A screenshot is an image: Claude charges it at
`ceil(width/28) x ceil(height/28)` visual tokens, and while Claude caps a single image at roughly
1,568 visual tokens on the standard tier (~4,784 on the high-resolution tier for Claude 4.7+) by
downscaling, providers and harnesses that don't downscale, or that hand back the full DOM alongside
the pixels, make each browser step far heavier.[^anthropic-vision] The larger cost is accumulation:
in a multi-turn loop, base64 images are re-sent on every turn unless referenced by
`file_id`,[^anthropic-vision] and Playwright MCP streams a full accessibility tree after each
navigation, so by a dozen steps the context is carrying stacks of stale snapshots.[^pw-mcp-issue-915]
The discipline is to feed the agent a **text accessibility snapshot** instead of a screenshot where
it can act on structure, keep those snapshots small, and drop images after use. This pulls **input
tokens (vision)** on the browser loop — the Playwright team's own benchmark puts a typical task at
~114,000 tokens through the MCP path vs ~27,000 through the CLI, roughly 4x.[^testcollab-cli]

## How to do it

The portable moves, cheapest first:

1. **Prefer accessibility snapshots over screenshots.** An accessibility snapshot is structured text
   — each interactive element carries a stable reference the agent clicks by ID — so the agent acts
   on page structure without spending vision tokens. This is the default in Playwright
   MCP (`browser_snapshot`); the screenshot tool (`browser_take_screenshot`) and coordinate clicking
   are opt-in via `--caps=vision`, so leave vision off unless a task genuinely needs pixels.[^pw-mcp-readme]
2. **Keep the snapshot small, and incremental where you can.** A full-page accessibility tree can
   itself blow the budget within a handful of steps.[^pw-mcp-issue-915] Send only the changed subtree
   after an action rather than the whole tree each time; incremental/diff snapshots and
   minimal-response options exist in a community fork today, ahead of the official server.[^fast-pw-mcp]
3. **Use the Playwright CLI instead of the MCP server for scripted flows.** The CLI keeps browser
   state on disk and returns concise output, so it avoids loading large tool schemas and full
   snapshots into context — the source of the ~4x gap above.[^pw-cli-intro][^testcollab-cli]
4. **When you do send an image, make it cheap and short-lived.** Crop to the region that matters and
   downscale before sending — token cost scales with pixel area, and anything past the model's limit
   is downscaled anyway, so pre-cropping keeps both the tokens and the detail you want.[^anthropic-vision]
   Turn off image responses entirely when they aren't needed (`--image-responses=omit` in Playwright
   MCP),[^pw-mcp-readme] and drop images from context once they've been used so they don't ride along
   on every later turn.[^anthropic-vision]

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool flags, MCP config, and
image-drop commands.

## When it's worth it / when not

- **Worth it:** any agent that drives a browser in a loop — E2E test authoring/repair, frontend
  bug-fixing against a running app, scraping/verification flows. The browser loop is the single
  most token-dense traffic in these sessions.
- **Biggest wins:** multi-step flows where a screenshot (or full snapshot) is taken every step and
  piles up across turns; scripted/repeatable flows where the CLI can replace the MCP server entirely.
- **Not worth it / where vision is required:** tasks that are genuinely visual — pixel-level layout,
  CSS/rendering bugs, canvas/chart output, visual regression. There, a (cropped, downscaled)
  screenshot is the right tool; don't force an accessibility snapshot onto a job that needs pixels.
- **Not relevant:** agents that never open a browser.

## What it costs you

- **Quality risk is real here (Medium).** An accessibility snapshot only exposes what's in the
  accessibility tree — it can't see a purely visual defect, and over-cropping or over-incrementalizing
  a snapshot can hide the element the agent needed, forcing a re-capture that re-pays the tokens.
  Keep vision available as a fallback for the steps that truly need it.
- **Setup effort (Medium).** Switching a team from screenshot-first to snapshot-first, wiring the
  Playwright CLI into the workflow, or adopting a non-default MCP fork for incremental snapshots is
  more than a one-line flag.
- **Fork/maintenance risk.** Incremental-snapshot behavior lives in a community fork today, not the
  official Microsoft server;[^fast-pw-mcp] weigh maintenance before standardizing on it.
- **Coordinate drift.** If you do downscale images, Claude reports coordinates against the resized
  image — pre-resize deliberately so coordinate-based clicks still line up.[^anthropic-vision]

## How to verify

- Compare input tokens (or tokens-per-turn) on a representative browser task run two ways: vision/
  screenshot path vs accessibility-snapshot (or CLI) path. The Playwright-team figure to sanity-check
  against is ~114k vs ~27k per typical task.[^testcollab-cli]
- Watch how much of the context is images/snapshots over a long loop — the failure mode is stale
  snapshots accumulating across turns.[^pw-mcp-issue-915] In Claude Code, `/context` and `/usage`
  show per-source usage and flag long-context when one source dominates.
- For any screenshot you keep, check its visual-token cost with `ceil(width/28) x ceil(height/28)`
  and confirm crop/downscale actually reduced it.[^anthropic-vision]

## Measured impact

_Not yet measured by us._ Benchmark: run the same frontend/E2E task twice on one app — a
screenshot/vision-first browser loop (baseline) vs an accessibility-snapshot-first loop (and, as a
second variant, the Playwright CLI in place of the MCP server) — and compare input tokens and cost
per passing task at equal success. Cited so far: the Playwright team's own benchmark of ~114,000
tokens (MCP) vs ~27,000 (CLI) on a typical browser-automation task, ~4x.[^testcollab-cli] ⚠ That
number is practitioner-relayed ("Playwright team's own benchmarks") without a primary link, and the
per-image visual-token math is from Anthropic's vision docs;[^anthropic-vision] link-check both before
publishing.

[^pw-mcp-readme]: microsoft/playwright-mcp, "README" — <https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md>
[^pw-cli-intro]: Playwright docs, "Playwright agent CLI — Introduction" — <https://playwright.dev/agent-cli/introduction>
[^testcollab-cli]: TestCollab, "Playwright CLI: the token-efficient alternative to Playwright MCP for AI coding agents" — <https://testcollab.com/blog/playwright-cli>
[^anthropic-vision]: Claude Platform docs, "Vision" — <https://platform.claude.com/docs/en/build-with-claude/vision>
[^pw-mcp-issue-915]: microsoft/playwright-mcp, issue #915 "Optimize browser_snapshot tool" — <https://github.com/microsoft/playwright-mcp/issues/915>
[^fast-pw-mcp]: tontoko/fast-playwright-mcp — <https://github.com/tontoko/fast-playwright-mcp>
