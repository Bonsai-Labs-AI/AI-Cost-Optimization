# Token Cost Optimization for Agentic Coding — Plan v0.2 (draft for review)

> **Status:** draft for review with Rony + Csongor. Everything here is a proposal —
> especially the pillar/technique taxonomy (§4) and the benchmark matrix (§5).
> Author: Daniel. Date: 2026-08-10. Target: complete ~Aug 22–24, launch September.
>
> **v0.2 (2026-08-10):** updated after a deep-research pass — see `docs/RESEARCH_FINDINGS.md`
> (23/25 claims adversarially verified). Framework validated; changes summarized in §4a below.
>
> **Structural decision (2026-08-10):** split the catalog into **FOUNDATIONS** (old P1 Measure +
> P2 Pricing — the one-time "see the spend / buy right" setup, *not* repeatable techniques) and
> **TECHNIQUES** (the pyramid: Routing, Context, Caching, Workflow, Quality/Eval). Wide first-pass
> candidate list compiled in `docs/CANDIDATE_TECHNIQUES.md` (~75 deduped candidates, 12 marked
> new/coding-specific) — next step is cutting it to ~30–35 with Rony.

---

## 1. Mission & customer context

Part 2 of the Bonsai Labs research series (Part 1: *Cost Optimization for AI Products*,
82 techniques, complete).

**The customer problem** (PE-owned portfolio companies): agentic-coding token consumption
is growing **~40% month-over-month**, it's getting seriously expensive, and there are **no
business results that clearly justify it**. CTOs need:

1. A **simple framework** to diagnose where their spend goes and what to fix first.
2. A **hands-on service angle**: we come in and set it up in their agentic-coding
   configs and repos (rules files, routing, caching discipline, guardrails, dashboards).
3. **Confidence that quality holds** when they cut cost — especially when switching to
   cheaper or open-weight models.

**Two framing points we should hold onto:**

- *"No business results to justify it"* cuts both ways. The framework must measure
  **cost per outcome** (per merged PR, per completed task), not just cost. Sometimes the
  answer is "spend is fine, attribution is broken"; usually it's both.
- The most expensive tokens in agentic coding are **discarded tokens** — failed runs,
  rework, runaway loops, context re-reads. Workflow discipline is a cost lever on par
  with model choice.

---

## 2. Deliverables (hybrid shape — decided)

| # | Deliverable | Audience | Form |
|---|-------------|----------|------|
| D1 | **CTO Playbook** — a one-page framework + "first 30 days" sequence | CTO / VP Eng | Short doc / deck; the marketing front door |
| D2 | **Technique catalog** — ~30–35 deep, cited technique pages on a 3-level maturity pyramid | Eng leads, senior devs | Astro site, same machinery as Part 1 |
| D3 | **Benchmark report** — our own measured comparisons (setups × tasks × models), with methodology | Both; backed by our own data | Report page(s) on the site + raw data |

D3 is what's different from Part 1 (which was all secondary research). Every recommendation
in D1/D2 should either cite a primary source **or point at our own data**.

D2 pages use a new operational format (see `docs/TEMPLATE.md`) — a portable description plus a
shared per-tool matrix (`TOOL_MATRIX.md`) and a "measured impact" block filled from D3 — not
Part 1's essay format (Overview / Detailed Approach / Example Where It Works).

---

## 3. Scope decisions (made 2026-08-10)

- **Primary subject: teams *using* off-the-shelf agentic coding tools** — Claude Code,
  Cursor, Copilot (agent mode), Cline, Aider, Codex CLI, OpenCode, Grok Build (and Windsurf,
  Gemini CLI, Goose) — not teams building their own coding agents. Config, repos, routing, plans, practices.
- **Benchmark stack: Claude Code-centric, with multi-model arms** (routing, cheaper
  models, open-weight) — matches Csongor's "Opus vanilla vs. Opus + context graph"
  example and our own stack. Techniques stay tool-portable where possible (a rules-file
  or caching principle applies to Cursor/Copilot too; pages note tool equivalents).
- **Out of scope:** general AI-product cost (→ Part 1), building custom coding agents,
  non-coding agents, GPU/serving infra, IDE licensing negotiation beyond plan-choice math.

---

## 4. Proposed framework — 8 pillars (for review)

Same 3-level maturity pyramid as Part 1 ("where are you, what's the next win"):

- **L1 — Hygiene:** visibility + zero-regret defaults. Days, not weeks. No quality risk.
- **L2 — Engineering:** deliberate config & workflow engineering, needs measurement.
- **L3 — Optimized:** routing, open-weight substitution, custom eval infra. Needs an
  eval harness to be safe.

Candidate techniques below (~44). Expect to cut/merge to ~30–35 in review with Rony —
same as Part 1's 124→82 pass. **Bench?** = gets a measured benchmark arm (D3) vs.
cite-only. Levels are provisional.

### 4a. Research-driven revisions (v0.2) — apply these to the tables below

Full evidence + citations in `docs/RESEARCH_FINDINGS.md`. Net: the 8 pillars all held.

1. **P3 Routing — reframe, don't expand.** Peer-reviewed (RouterArena, ICLR 2026): auto query-routers
   give **~35% savings at best**, most **over-rely on the strongest model**, and **commercial ≯ open-source**
   (NotDiamond last of 12). So order P3 by confidence: **(a) manual task-class right-sizing** (lead, reliable) →
   **(b) auto routers** (modest, set expectations) → **(c) trajectory/escalation routing** (SWE-Router; emerging,
   coding-native). Gateways (LiteLLM/Bifrost) move to P7 as the *mechanism*.
2. **P4 — add a first-class technique: "Tool-output / dev-loop-noise filtering (hooks)"**, L2, Bench ✔ —
   strip `git status`/test/build output before it hits the model. Practitioner-reported **60–90%** dev-loop
   output cut. Re-word the MCP row: definitions are now **deferred by default** (only names load), so the reason
   is "CLI tools add no per-tool listing," not "MCP dumps schemas."
3. **P8 — upgrade eval:** cost-per-passing-task is now readable off SWE-bench Verified (**$/instance** published).
   Method = shortlist models off the public board → gate the swap on your own golden-task eval.
4. **P2 — two updates + a cliff:** Copilot moved to **token-based AI Credits (Jun 1 2026)** — drop the PRU framing;
   **Batch API is async-only** (offline coding work only, not live loops); **Sonnet 5 intro pricing ends Aug 31
   2026 (+~50%)** — we launch in September, so model everything on post-Sept pricing.
5. **P5 — add exact economics:** cache read 0.1× / 5-min write 1.25× / 1-hr write 2×; **cache TTL = 1 hr on
   subscription, 5 min on usage-credits/API** (`ENABLE_PROMPT_CACHING_1H=1` to keep 1 hr).
6. **P1 — name the tooling:** native OTel (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, metrics `claude_code.token.usage` etc.)
   + `ccusage` (15+ CLIs, local); per-dev/team attribution via a gateway (P7).
7. **P6 — caution:** agent teams/subagents cost **~7× tokens** in plan mode — a lever *and* a waste source.
8. **Intro framing:** coding agents are **~40% of tracked gateway tokens** and use **~15×** the tokens per
   request of human-interactive use — useful context to open the CTO playbook with.

### P1. Measure & Attribute *(the starting point)*

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Token & cost observability | Turn on native telemetry (Claude Code OTel/JSON output, ccusage, Cursor/Copilot dashboards) | 1 | — |
| Per-dev / per-team / per-repo attribution | Gateway keys & tags (LiteLLM proxy etc.) so spend maps to owners | 1 | — |
| Cost-per-outcome metrics | $/merged PR, $/completed task — the anti-"40% MoM with no results" metric | 2 | — |
| Budgets & alerts | Hard/soft caps per dev/day, anomaly alerts | 1 | — |
| Session audits | Sample transcripts to find waste patterns (re-reads, context dumps, loops) | 2 | — |

### P2. Plan & Pricing Arbitrage *(often the fastest fix)*

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Subscription vs. API math | Max/Team plans vs. metered API; break-even usage per dev profile | 1 | — |
| Cache-discount awareness | Prompt-cache read/write pricing changes which workflows are cheap | 1 | ✔ (falls out of P5 arms) |
| Batch/background pricing | Non-interactive work (docs, review sweeps, migrations) on batch/off-peak pricing | 2 | — |
| Enterprise/committed discounts | When volume justifies committed-use agreements | 2 | — |

### P3. Model Choice & Routing *(Csongor's explicit ask)*

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Model right-sizing per task class | Premium for hard reasoning; mid/cheap for edits, tests, boilerplate, commit msgs | 1 | ✔ |
| Multi-model inside one tool | Claude Code /model + per-subagent models; Aider architect/editor split; Cursor picker | 2 | ✔ |
| Reasoning/thinking budget control | Effort levels & thinking toggles — reasoning tokens are pure output cost | 1 | ✔ |
| Model routers & gateways | LiteLLM, OpenRouter & friends: routing rules, fallbacks, one bill | 2 | ✔ |
| Open-weight substitution | Qwen3-Coder / DeepSeek / GLM / Kimi-class models, hosted or local, for suitable task classes | 3 | ✔ |
| Cheap models for subagents/background | Fan-out search, summarization, CI chores on the cheapest capable model | 2 | ✔ |

### P4. Context Engineering

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Rules-file hygiene | CLAUDE.md / AGENTS.md / .cursorrules: short, high-signal — it's in **every** prompt | 1 | ✔ |
| Targeted context, not repo dumps | Point at files/dirs; ban whole-repo @-mentions | 1 | — |
| Repo maps / code indexing / context graphs | Give the agent a map so it stops reading files to orient — **Csongor's A/B example** | 2 | ✔ |
| Session hygiene: /clear, /compact, fresh sessions | Long sessions accrete dead context; know when to reset | 1 | ✔ |
| Context offloading | Scratchpads/notes/memory files instead of re-deriving in-context | 2 | — |
| Sub-agents for context isolation | Fan-out reads return conclusions, not file dumps, to the main loop | 2 | ✔ |
| MCP server discipline | Every connected server's tool schemas eat context; prune, defer, lazy-load | 1 | ✔ |
| Monorepo scoping | Working-dir and workspace scoping in large repos | 2 | — |

### P5. Caching Discipline

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Prompt-cache mechanics for agents | How prefix caching + TTL work in coding tools; read the cache-hit column first | 1 | ✔ |
| Stable prefixes | Don't churn rules files / tool sets / system config mid-session | 1 | ✔ |
| Cache-aware work cadence | Iterate within TTL windows; batch config changes between sessions | 2 | — |
| Gateway-level caching (API setups) | Exact/semantic caching at the proxy for repeated org-wide asks | 3 | — |

### P6. Workflow & Agent-Loop Discipline

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Plan-first / spec-first | Approve a plan before code; cheapest tokens are the ones never generated | 1 | ✔ |
| Task granularity | Scoped tasks beat "build the feature" mega-prompts; fewer runaway explorations | 1 | — |
| Prompt specificity | Vague prompt = paid exploration; file paths & acceptance criteria up front | 1 | — |
| Fail fast, checkpoint, revert | Kill bad runs early; git-checkpoint so retries don't re-pay for context | 2 | — |
| Loop guardrails | Max-turns/budget stops, hooks against runaway tool-call loops | 2 | — |
| Test-driven agent work | Objective success criteria cut iteration count | 2 | ✔ (via harness) |
| Headless/CI discipline | Agents in CI burn silently: caps, caching, cheap models, dedup triggers | 2 | — |

### P7. Team Practices & Governance *(the "we set it up in your repos" service)*

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Standardized repo config | Checked-in rules files, permissions, hooks — good defaults for every dev | 1 | — |
| Usage-pattern education | What expensive vs. cheap sessions look like; internal patterns library | 2 | — |
| Spend-review ritual | Monthly per-team review: top spenders, top waste patterns, wins | 2 | — |
| When NOT to use the agent | Trivial edits, mass mechanical refactors better done with tools/scripts | 1 | — |
| Central gateway governance | Org-level keys, quotas, model allowlists per task class | 3 | — |

### P8. Quality & Evaluation *(Csongor's priority)*

| Technique | One-liner | Lvl | Bench? |
|---|---|---|---|
| Internal eval set from your own repos | Golden tasks mined from merged PRs (the merge is ground truth); SWE-bench-style | 3 | ✔ (we build one) |
| Objective quality gates | Build/tests/lint pass-rate as the first, non-subjective quality layer | 2 | ✔ |
| LLM-as-judge rubrics | Scored rubric for maintainability/style on top of objective gates | 3 | ✔ |
| Regression-gated model swaps | No premium→cheaper/OS switch without a green eval run on your own tasks | 3 | ✔ |
| Cost per passing task | The single number that combines cost and quality | 2 | ✔ |

**Cut candidates going in:** monorepo scoping (fold into targeted context), cache-aware
cadence (fold into stable prefixes), prompt specificity (fold into task granularity),
batch pricing (thin for coding workflows). Rony may add pillars I'm missing — e.g.
editor-side (tab-completion spend) or code-review-agent spend.

---

## 5. Benchmark design (D3)

**Principle: never report raw tokens alone.** A cheaper run that fails isn't cheaper.
Main metric = **cost per quality-passing task** (API-equivalent pricing), with
tokens/turns/wall-clock as diagnostics.

### 5.1 Task suite (3–5 tasks, one mid/large OSS repo)

Pick a large, realistic, buildable OSS repo (candidate criteria: >200k LOC, good test
suite, active — final pick during harness setup; alternatives: a portfolio-like internal
repo if one is available). Tasks:

| # | Task class | Success criterion |
|---|-----------|-------------------|
| T1 | Mid-size feature (touches 5–10 files) | Provided acceptance tests pass |
| T2 | Bug fix from issue report | Failing test → passes; suite stays green |
| T3 | Cross-cutting refactor | Suite green + structural assertion (e.g. no imports of X remain) |
| T4 | Test-writing for uncovered module | Coverage delta + tests pass and are non-trivial (judge) |
| T5 (stretch) | Small task class (commit msg / docstring sweep) | Judge rubric only — the "cheap model" home turf |

### 5.2 Arms (setups compared)

| Arm | Setup | Tests pillar |
|-----|-------|--------------|
| A0 | Premium model, vanilla (no rules file, no index) — the baseline | — |
| A1 | A0 + well-crafted CLAUDE.md | P4 rules hygiene |
| A2 | A1 + repo map / context graph (e.g. LSP/symbols MCP or repomap) | P4 — **Csongor's exact A/B** |
| A3 | A1 with bloated 5k-line rules file (the anti-pattern, measured) | P4 (negative control) |
| A4 | Mid-tier model (same config as A1) | P3 right-sizing |
| A5 | Routed multi-model (premium plans/hard steps, cheap subagents/chores) | P3 routing |
| A6 | Open-weight model (hosted), same config as A1 | P3 OS substitution |
| A7 | A1 + plan-first workflow (plan approved before code) | P6 |
| A8 | Cache-hostile variant (rules file churned mid-session) vs. A1 | P5 (negative control) |

Not every arm × every task: **core matrix = A0–A2, A4–A6 on T1–T3** (~5 reps each),
negative controls and A7 on T1 only (~3 reps). ≈ 100–120 runs total.

### 5.3 Measurement harness

- Claude Code **headless** (`claude -p`) with JSON output → per-run cost/usage/turns;
  OTel telemetry as cross-check; runs from a **pinned base commit** in throwaway
  worktrees; task spec identical across arms, verbatim.
- API-key billing (not subscription) so marginal cost is real and comparable; pricing
  snapshot pinned in the report. Subscription-plan economics reported separately in P2.
- Open-weight arm via a hosted OS provider (one signup — Csongor offered; recommend an
  aggregator so one account covers several models).
- **N ≥ 3–5 reps per cell** — agentic variance is large; report median + spread, not
  single runs.
- Quality per run: objective gate (tests/build) → judge rubric (fixed model+prompt,
  pinned) → human spot-check on a sample.

### 5.4 What we expect to learn (hypotheses)

1. Rules file + repo map cuts input tokens materially vs. vanilla (exploration reads
   drop) — and *bloated* rules files cost more than nothing at all.
2. Mid-tier models pass T1–T3 at a fraction of premium cost for a subset of task
   classes — and fail visibly on others (that boundary IS the routing policy).
3. Open-weight models are credible on some classes; the eval harness is what makes
   using them safe.
4. Cache-hostile behavior is one of the largest silent multipliers.

---

## 6. Quality & eval methodology (D2/P8 + used by D3)

Layered to reduce subjectivity:

1. **Objective gates first:** compiles, tests pass, lint clean, diff touches intended
   scope. Free of opinion; catches most failures.
2. **Rubric LLM-judge** (pinned model + prompt, published rubric): correctness beyond
   tests, maintainability, idiom-match. Calibrate the judge once against human scores
   on ~20 samples; report agreement.
3. **Human spot-check** on a sample; disagreements feed back into the rubric.

**For clients (the P8 pages):** freeze 20–50 golden tasks mined from their own merged
PRs → internal SWE-bench-style suite → every model/config change ships only behind a
green eval run. This converts "can we use a cheaper model?" from opinion to regression
test — and it's a second service angle (we build the eval set for them).

---

## 7. Timeline (~2 weeks, September launch)

| Dates (Aug) | Work |
|---|---|
| 10 | This plan v0.1 → share with Rony (+ Csongor) in the AI-SDLC channel |
| 11–12 | Taxonomy review with Rony; converge to final ~30–35 techniques. In parallel: harness skeleton (headless runner, metrics capture, repo pick) |
| 12–14 | **Pilot**: 1 task × 3 arms × 3 reps end-to-end → fix methodology while cheap. Credits ask to Csongor with cost projection after pilot |
| 15–19 | Full benchmark matrix (background runs) + technique research waves (reuse Part 1's brief→subagent→citation-gate pipeline & Astro machinery) |
| 19–21 | Benchmark analysis + report; CTO playbook (D1) distilled from what the data supports |
| 22–24 | Buffer: review pass, citation gate, internal review with Csongor |

Risks: benchmark variance forcing more reps (mitigate: median-of-5, report spread);
OSS repo flakiness (pick for test-suite reliability); credit budget (pilot first, then
a concrete ask); 2 weeks is tight — D3 scope flexes before D2 quality does (drop arms
T4/T5/A7/A8 first, never rigor on the core matrix).

## 8. Open questions

1. **For Csongor:** which tools do the portfolio companies actually run at scale
   (Cursor? Copilot? Claude Code?) — changes D1 examples and tool-equivalence notes,
   not the framework. Can we get one sanitized real repo + 3 real tasks as a case study?
2. **For Csongor:** OS-model platform signup — recommend an aggregator (one account,
   many models) unless there's a preferred vendor. Credits: pilot first, then ask with
   a projection (rough order: low hundreds of $ for the full matrix).
3. **For Rony:** what's missing from the pillars? Where does his day-to-day spend
   actually go? Which anti-patterns does he see most? Eval-set ideas (Csongor's "how do
   companies build eval sets for themselves").
4. Site: new standalone pyramid site (like Part 1) — same repo machinery cloned, new
   taxonomy. D1 playbook likely lives on the site + a deck export. Confirm with Csongor
   how it'll be packaged with Part 1's launch.

## 9. What we reuse from Part 1

- Astro site machinery: taxonomy.mjs → stub generator → schema-validated frontmatter →
  pyramid UI (clone, don't fork content).
- Research pipeline: per-technique briefs → one subagent per technique → citation-sync
  + URL-verification gate → build gate. Proven on 82 pages.
- Editorial standards: 5–10 primary sources/page, honest scorecards (effort/gain/risk),
  "where it does NOT work" section mandatory, `accessed:` dates.
- New for Part 2: technique pages may additionally cite **our own benchmark data**
  (D3) — a source class Part 1 didn't have.
