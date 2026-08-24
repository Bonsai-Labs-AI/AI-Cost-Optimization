# Candidate Techniques — Token Cost Optimization for Agentic Coding

> **v0.3, 2026-08-10.** Compiled from a 6-domain research pass, updated after two review passes, then
> processed against Daniel's review comments (removes, merges, clarifications). Still trimming toward a
> final ~30–35. Entries Daniel questioned now carry a short clarification inline.

## How to read this

- **Structure:** **FOUNDATIONS** = the setup you do once to see spend and buy right (not repeatable
  optimization). **TECHNIQUES** = the repeatable changes (the pyramid).
- Each entry: **Name** — what it does + the cost lever · **level** · **tools** · flags.
- **Level:** L1 (quick, no quality risk) · L2 (needs config or measurement) · L3 (advanced or
  architectural). Foundations are marked **F**.
- **Flags:** ★ = new or coding-specific, worth prioritizing · ⚠ = the number is practitioner-sourced,
  check it before publishing · ↔ = also relates to another group.

## Where the tokens go

Most of a coding agent's tokens go to reading and searching the codebase — about 46–56% in
practitioner reports — not to writing code (about 5–15%). ⚠ Practitioner-sourced; confirm before use.

## New or coding-specific techniques (worth prioritizing)

1. ★ **Tool-output / dev-loop-noise filtering (command wrappers)** — a wrapper filters `git status`/test/build
   output before it reaches the model. ⚠ 60–90% less dev-loop output. [RTK](https://parkerjones.dev/posts/rtk-token-killer/)
2. ★ **Code-execution / "code mode" MCP** — the agent calls MCP tools from code so intermediate results don't
   pass through context. ⚠ 150k → 2k in Anthropic's example. [Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp)
3. ★ **Symbol / repo-map retrieval so the agent stops reading files to orient** — LSP-symbol MCP or repo map.
   [Serena](https://github.com/oraios/serena), [Aider repomap](https://aider.chat/docs/repomap.html) (main benchmark arm)
4. ★ **Fork / shared-cache subagents** — a forked subagent reuses the parent's cache prefix; a fresh one re-pays.
5. ★ **Explorer / repo-scout subagent** — a read-only agent returns short citations, not file contents. ⚠ weak source.
6. ★ **Self-improving rules file** — roll each fix or convention back into AGENTS.md/CLAUDE.md. ⚠ ~16.6% fewer output tokens.
7. ★ **Deterministic orchestration instead of LLM coordination** — move coordination into scripts/hooks; spend LLM
   turns only where judgment is needed. ⚠ one case: 4.6M → 506k tokens (8×). [Adam Jacob](https://www.adamhjk.com/blog/a-practical-guide-to-reducing-token-spend/)
8. ★ **MCP Tool Search / on-demand tool loading** — load tool schemas when needed (now default in Claude Code). ~85% less MCP overhead.
9. ★ **Build your own eval from merged PRs + cost per passing task** — how you check a cost cut didn't lower quality.
10. ★ **Cache-invalidation hygiene** — avoid what silently breaks cache hits: timestamps/UUIDs in the prefix,
    switching model or tools mid-session, the ~20-block lookback window.
11. ★ **`ANTHROPIC_API_KEY`-on-subscription trap** — if the key is set, Claude Code bills metered API rates. [Finout](https://finout.io/blog/claude-code-pricing-2026)
12. ○ **Trajectory / escalation routing** — cheap model explores, escalate on the partial run/failure. Research-stage — watch, don't build yet.

---

# FOUNDATIONS  *(setup — not part of the technique pyramid)*

## A. Measure & attribute
- **Native tool telemetry** — turn on built-in usage/cost metrics. `F`. Tools: Claude Code OTel
  (`CLAUDE_CODE_ENABLE_TELEMETRY=1`), `/cost` & `/usage`, `/context`; Copilot Metrics API; Cursor dashboard.
- **Local usage tooling (no infra)** — parse local logs into cost tables. `F`. Tools: ccusage, TokenTracker.
- **Gateway/proxy attribution** — one attributable bill; per-dev/team/repo tags + virtual keys. `F` ↔routing.
- **Provider cost/usage APIs** — source-of-truth attribution, incl. cached vs uncached and cache-hit rate. `F`.
- **Dashboards & FinOps normalization** — showback per dev/team/repo. `F`.
- **Ship telemetry by default (managed settings/MDM)** — no opt-in gaps. `F`.
- **Session-transcript audit** — read real usage to find context bloat and MCP-injection waste. `F` ↔context.
- ★ **Editor-surface spend audit** — check which surfaces are metered first: completions/Next Edit are free on
  Copilot/Cursor paid plans; codebase-index embeddings and API-key autocomplete are not. `F`.

## B. Metrics that turn spend into a business signal
- **Cost-per-outcome metric (setup)** — cost per merged PR / completed task. `F` ↔quality.
- **Cost per active seat** — expose idle or under-used seats.
- **Fully-loaded TCO baseline** — seat + usage + enablement + review + remediation, not the invoice.
- **Model-mix ratio** — share of spend by tier; shows premium over-use.
- **Cache-hit-rate KPI** — track per project/dev; misses can roughly 10× input cost. ↔caching.

## C. Budgets, quotas & anomaly alerts
- **Hard spending caps** — Copilot cap, Claude org/seat limits, Cursor limits, gateway budgets. `F`.
- **Graduated alerts (50/80/100%)** — size on P95, not the average.
- **Burn-rate / baseline-deviation alerts** — catch runaway loops mid-month, not just fixed caps.

## D. Plan & pricing decisions
- **Subscription vs API break-even** — Max tiers vs metered, per dev profile. `F`.
- **Per-seat vs consolidated-API decision** — one attributable API bill is often cheaper for teams.
- **Copilot AI-Credits math** — token-based since Jun 2026; size pooled allowances to actual agent use.
- **Cursor seat-tier right-sizing** — Premium (5× usage) only for the heaviest agent users.
- **BYOK vs subscription** — removes the tool markup and gives attribution; flat sub wins for heavy daily use.
- **Enterprise committed-use discount** — ~15–30% off list; watch the committed-cap overage.
- **Service-tier selection** — Standard/Priority/Batch per workload.
- ★ **Off-peak / time-window pricing** — schedule batch/CI/bulk work in off-peak windows. `F` ↔CI. ⚠ DeepSeek off-peak = 50% of peak.
- ★ **Free-tier / data-for-training arbitrage** — $0 capacity for low-stakes work, with a governance tradeoff
  (Gemini CLI ~1,000/day free; Amp Free trains on your code). `F`.
- ★ **Harness choice sets a fixed per-turn floor** — the tool itself decides how many tokens go out before your
  prompt (OpenCode ~7k vs Claude Code ~33k ⚠) and whether you can point at cheaper models; model-agnostic harnesses
  (OpenCode, Grok Build) make substitution easy. `F`. Note: Claude Code's larger base is mostly prompt-cached, so the
  raw gap overstates the ongoing cost.
- ★ **Avoid the `ANTHROPIC_API_KEY`-on-subscription trap** — unset the key on flat plans. `F`.

---

# TECHNIQUES  *(the pyramid)*

## 1. Model choice & routing
Order by what's reliable: use the model settings your tool already has before buying a router.

### Right-size inside the tool (reliable)
- **Task-class → model-tier map (+ escalate on failure)** — cheap tier for edits/tests/commit-msgs, mid for
  features, top tier for hard reasoning/debug; start cheap, bump a tier only on visible failure. L1. Tools (the
  per-tool "how"): Cursor Auto, Copilot Auto (+10% credit discount), Windsurf's own SWE models, Gemini Flash default.
- **Strong-plan / cheap-execute split** — reason on a strong model, implement on a cheap one (most tokens are in
  execution). L2. Tools: Claude Code `opusplan`, Aider architect/editor, Cline/Roo Plan/Act, Goose lead/worker.
- **Cheap model — or no model — for housekeeping** — commit messages, summaries, simple refactors on the cheapest
  capable model, or better, done deterministically with a script/template so no model is called at all. L1.
  Tools: Aider `--weak-model`, Claude Code per-subagent `model:`. ↔workflow (deterministic orchestration; when not to use the agent).

### Substitution — cheaper backends
- **Repoint the agent at open/cheap models** — swap model slots via `ANTHROPIC_BASE_URL`/gateway; pick the open
  model per task class, paid per-token or via a flat-rate "coding plan" (GLM/Kimi/Qwen). L2–L3. ⚠ non-Anthropic
  backends can mishandle tool-calling/edits — eval-gate the swap. Models: DeepSeek, Qwen3-Coder, GLM, Kimi (open);
  grok-code-fast (cheap proprietary, ~$0.20/$1.50 per M, 70.8% SWE-bench). ⚠
- ★ **Shared self-hosted model for the team's cheap tier** — one internal box/GPU runs a small open model (vLLM/SGLang/Ollama)
  that every dev's agent points at via base-URL; near-zero marginal token cost, and prefix caching reuses KV across devs.
  L3. Needs GPU + ops; worth it at team scale, not for one dev.

### Gateways & routers
- **AI gateway (the plumbing/control plane)** — one endpoint in front of the agent that rewrites model aliases,
  tracks per-key spend, enforces budgets, and fails over. Not a routing *decision* by itself. L2 ↔foundations.
  Tools: LiteLLM, Bifrost, Portkey, OpenRouter, Requesty.
- **Auto query-router (the decision policy)** — picks a model per request; can run on top of a gateway. L2. ⚠ modest:
  RouterArena (ICLR 2026) found ~35% ceiling and commercial routers no better than open-source. Tools: Not Diamond Code, Cursor Router.

## 2. Context engineering

### Rules-file hygiene
- **Keep the rules file small (and scoped)** — CLAUDE.md/AGENTS.md/.cursorrules load every prompt; cap size, prune
  stale, use short bullets, and scope rules per-directory so subsystem detail loads only in that subtree. L1.
  ⚠ a bloated 1,200-line file cost ~42k tokens/conversation.
- **Move detail into on-demand skills** — load name + description only; prune unused skills. L2.
- ★ **Self-improving rules file** — after the agent solves something or you correct it, capture that rule/convention
  in the rules file so it doesn't repeat the work or the mistake; some tools can propose the update. L2. ⚠ ~16.6% fewer output tokens.

### Targeted context (not repo dumps)
- **Point at files; ban whole-repo @-mentions** — plus ignore-files to exclude build/vendored dirs; scope the
  working set. L1. Tools: `.cursorignore`, `.clineignore`, `.aiderignore`, `@file` vs `@codebase`.

### Code indexing / retrieval
- ★ **Symbol / repo-map retrieval** — give the agent a map so it stops reading files to orient. L2. Tools:
  Serena/LSP-symbol MCP, Aider repomap, Cursor codebase index, ctags fallback. ↔caching (keep the map stable).
- **Codebase-index embedding spend** — index tools (Roo/Kilo/Continue) bill embeddings to your key; use cheap/free
  embedders, scope with ignore-files, avoid full re-index churn. L1. ↔foundations (audit).

### Session hygiene
- **Session cadence** — `/clear` and `/compact` at task boundaries to stop re-billing a stale transcript, but keep a
  session warm within the cache TTL for a burst of related tasks. L1–L2. ↔caching. Tools: Claude Code, Cursor, Codex, Aider.
- **Fresh session + handoff doc per task** — write a short state file, restart clean. L2.
- **Long-context price cliff (Gemini)** — Gemini bills the whole request ~2× once the prompt crosses 200k tokens;
  keep context under it. L1. ⚠ Anthropic *removed* its >200k surcharge in Mar 2026 — don't cite the old Claude one.

### Context offloading
- **Scratchpad / filesystem-as-memory** — partly automatic in Claude Code, but the technique is deliberately telling
  the agent to write big intermediate results to a file and read back only what it needs, not carry them in context. L2.

### Sub-agents for context isolation
- ★ **Fan-out reader / explorer subagent** — Claude Code already gives you subagents; this is using them on purpose so a
  heavy read/search runs in a throwaway context and only the conclusion returns to the main thread. Not automatic — you
  choose when to delegate. L3. ⚠ costs tokens (~7×, see Group 4) — worth it only when reads are heavy or parallel.
- ★ **Fork / shared-cache subagent vs fresh** — a fork reuses the parent cache prefix; a fresh one is cleaner but costs more. L3. ↔caching.

### MCP discipline
- **Prune/scope MCP servers; prefer CLI tools; on-demand tool loading** — deferred defs are the default now (don't
  disable them); allowlist per project; prefer `gh`/`aws`/`git` over large schemas. L1–L2. ⚠ 5 servers ≈ 55k tokens.
- ★ **Code-execution / "code mode" MCP** — emerging. Claude Code has code execution + MCP, but "code mode" specifically
  means calling MCP tools from code so big intermediate results never enter the transcript. Partly available, not default. L3.
  ⚠ 150k → 2k in Anthropic's example.

### Tool-output & output shaping
- ★ **Filter/compress command output before it reaches the model (command wrappers)** — a wrapper runs the command
  and returns a filtered result; in Claude Code a `PreToolUse` hook can route commands to it (hooks can't filter
  output after the fact). L2. ⚠ 60–90% less dev-loop output. Variants: tests-failures-only, build-errors-first,
  `git status`/diff truncation, `--quiet` at the source, native output caps (`MAX_MCP_OUTPUT_TOKENS`) as a backstop.
- ★ **Browser/vision token discipline** — for frontend/E2E loops, use accessibility snapshots not screenshots (one
  full-page screenshot can exceed 200k tokens); Playwright CLI over Playwright MCP. L1–L2. ⚠ [Playwright](https://playwright.dev/mcp/snapshots)
- **Terse output & diff-only edits** — instruct concise responses; use patch/diff edit formats (Aider diff mode,
  Claude Code Edit) instead of re-printing whole files, which bills output tokens and re-enters context. L1.

## 3. Caching discipline

- **Stable prompt prefix** — don't change the rules/system config mid-session; batch config changes at boundaries. L1.
- ★ **Remove silent cache invalidators** — timestamps, UUIDs, unsorted JSON in the prefix. L2.
- **Stable tool/MCP ordering; don't switch models mid-session** — caches are position- and model-scoped. L2.
- **Iterate within the TTL; know your cadence** — the cache expires after a set time (1 hr on subscription / 5 min on
  usage-credits or API); come back within it or the whole context is re-charged. `ENABLE_PROMPT_CACHING_1H` keeps 1 hr. L1–L2.
- **Check that the cache is hitting** — audit `cache_read_input_tokens`; zero means a silent invalidator is burning full price. L2.
- **Cache read/write economics** — read 0.1×, write 1.25× (5-min)/2× (1-hr); break-even ~2–3 reads. L2.
- ★ **Watch the ~20-block lookback window** — long tool-heavy turns overflow it and miss the cache; add breakpoints. L2.
- **Keep the cache warm across short breaks** — Aider `--cache-keepalive-pings`. L2.
- ★ **Org-shared prompt cache** — Anthropic caches are org-scoped, so standardizing CLAUDE.md / tool order / system config
  across the team lets byte-identical prefixes share one cache team-wide. L2. ↔governance.
- **Provider cache parity (OpenAI / Gemini / Copilot)** — same hygiene, different economics: caching is on by default with
  these providers too, so the "stable prefix" rules pay off for Codex/Gemini CLI/Copilot users as well. L1–L2.
- **Cache-aware gateway routing** — load-balancing gateways can silently zero the provider cache; pin requests with a
  shared prefix to the deployment that wrote it. L2–L3. ↔routing.

## 4. Workflow & agent-loop discipline

- **Plan / spec before code** — approve a plan or write a short spec first; the cheapest tokens are the wrong-direction
  code you never write. L1–L2. ⚠ spec-driven pipelines can use up to 2× tokens — weigh it. Tools: Claude Code plan mode, Cline Plan, Aider `/ask`.
- **Scope and specify the task up front** — full task, paths, acceptance criteria in the first turn; scoped tasks beat
  mega-prompts. L1. Nuance: over-splitting trivial tasks re-pays fixed overhead each session.
- **Fail fast — kill bad runs early** — interrupt an off-track run. L1.
- **Git checkpoints + revert so retries don't re-pay for context** — L2. Tools: git, Cline/Cursor checkpoints.
- **Loop guardrails** — max-turns / token budgets / anti-runaway hooks. L2–L3. Tools: `--max-turns`, task budgets, Goose `--budget`, Cursor Max budget.
- **Test-driven agent work** — objective success criteria cut the number of iterations. L2. ↔quality.
- **Headless/CI cost discipline** — caps + cheap models + caching + fail-fast in `-p` mode. L2.
- **Dedup / gate CI agent triggers** — don't fire an agent on every push/comment; debounce, filter by path/label, skip no-ops. L2.
- ★ **Code-review-bot cost discipline** — path filters (exclude lockfiles/vendored/generated), skip draft PRs, review once
  per PR not per push; note two-meter billing (credits + Actions minutes). L1–L2. ⚠ [CodeRabbit](https://docs.coderabbit.ai/configuration/auto-review)
- **Move non-interactive work to the Batch API / offline** — 50% off, async-only. L3. ↔pricing.
- **Know when not to use the agent** — codemods/`sed`/AST tools for mechanical edits; trivial edits by hand. L1.

### Multi-agent / orchestration *(L3 — read together)*
- **Multi-agent orchestration economics** — the ~7× rule; parallelize reads, not writes. L3. ⚠ a 23-subagent run cost
  ~$47k over 3 days. Best first uses: PR review, parallel bug investigation. (Canonical home of the ~7× number.)
- ★ **Deterministic orchestration instead of LLM coordination** — replace coordinator agents with scripts/hooks; spend
  LLM turns only on judgment. L2–L3. ⚠ one case: 4.6M → 506k tokens (8×).
- **Async / cloud background agents** — hosted agents (Cursor Cloud, Codex Cloud, Copilot coding agent, Devin) run
  unattended and meter differently (ACUs, credits + Actions minutes; one task ≈ 20–50 premium-request-equivalents).
  Use for well-scoped jobs, not trivial edits. L2–L3.

## 5. Quality & evaluation  *(not covered in Part 1)*

- ★ **Build your own eval set from your repos** — golden-PR replay (merge = ground truth), fail-to-pass test harvesting,
  a versioned held-out suite, a "would this be merged?" filter. L2–L3.
- **Objective quality gates as an early stop** — build/tests/lint aren't just quality checks; run them as the agent's
  stop condition so it halts on green (or fails fast on red) instead of burning more turns polishing. L1–L2.
- **Calibrated LLM-as-judge** — a rubric for maintainability, calibrated against human labels, judge model+prompt pinned. L2–L3.
- **Regression-gated model swaps** — no premium→cheaper/open switch without a passing eval on your suite; eval-gated CI. L2–L3.
- ★ **Cost per quality-passing task (eval output)** — dollars ÷ tasks that pass all gates; include human-fix time. L2–L3. ↔foundations.
- **Public leaderboards for shortlisting (screening aid)** — SWE-bench Verified $/instance, Aider polyglot cost/run; ⚠ use for screening only. L1. ↔model choice.
- **Eval harnesses to run your own** — mini-SWE-agent, official SWE-bench harness, HAL, OpenHands, Braintrust/Langfuse. L2–L3.
- **Drift monitoring** — re-run the frozen suite on a schedule; sample production traces with a reference judge. L2–L3.

---

## Verification status & caveats

- **Factual correction:** Anthropic removed its >200k long-context surcharge in Mar 2026. Only Gemini still bills a
  >200k cliff. Don't republish the old Claude surcharge.
- **Practitioner numbers to verify:** context = 46–56% of tokens; ~7× agent teams; ~$47k example; 60–90% dev-loop cut;
  8× deterministic orchestration; Mem0 3–4×; explorer-subagent ~60%. (RouterArena ~35% and code-execution-MCP 98.7% are primary and solid.)
- **Post-cutoff model names** are as the 2026-dated sources state them; scores/prices change — cite with the read date.

## Resolved (2026-08-10)

- Coding-plan subscription substitution → folded into "Repoint the agent at open/cheap models."
- Cut: LLMLingua compression, gateway semantic caching, Mem0 memory layer.
- Trajectory/escalation routing → kept as a research-stage watch-item (○), not a core candidate.

## Changes in v0.3

- **Removed** (your review): net-cost-per-task, cheap-model-for-inline-completion, reasoning-effort right-sizing, monorepo scoping.
- **Merged:** model-picker → task-class map; hierarchical rules → "keep rules file small."
- **Reframed / clarified:** local model → shared team self-hosting; housekeeping → "or make it deterministic"; gateway
  vs auto-router distinction; scratchpad / explorer-subagent / code-execution-MCP now say what's automatic vs what you add;
  objective quality gates → run them as an early stop to save turns.
