# Research Findings — Token Cost Optimization for Agentic Coding

> Deep-research pass, **2026-08-10**. Input to the v0.2 plan and the Rony/Csongor review.
> Method: fan-out harness — 5 angles → 23 sources fetched → 97 claims extracted →
> **top 25 adversarially verified** (3 skeptical "try-to-refute" votes each; ≥2 refutes kills)
> → 8 synthesized findings. **23 of 25 claims confirmed, 2 killed.**

## How to read this

- **[Verified N-0]** = passed the 3-vote adversarial gate (primary source, no successful refutation).
- **[Lead]** = extracted from a source but **not** put through the vote (it wasn't in the ranked top-25).
  Treat as a pointer to chase, not an established fact — especially the single-blog ones.
- **[Refuted]** = a voter disproved it. **Do not use.** Listed so we don't re-introduce them.
- **Confidence ≠ importance.** Vendor self-reported numbers are flagged even when 3-0.
- **Time-sensitive.** Pricing has hard expiry dates; this is a **2026-08-10 snapshot**. Re-verify quarterly
  (same maintenance discipline as Part 1's `accessed:` dates).
- Post-cutoff model names (Sonnet 5, Opus 4.x/5, DeepSeek V3.2/V4, MiniMax M2.5, GPT-5.x, Gemini 3)
  are reproduced **as the 2026-dated sources state them**. Leaderboard *numbers* churn — cite with the read date.

---

## Summary — what this changes in the plan

1. **The framework holds up.** All 8 pillars survive; the research mostly confirms and sharpens them.
   No structural rework needed.
2. **Reframe Routing (P3) — the biggest change.** Peer-reviewed evidence (RouterArena, ICLR 2026) says
   automatic query-routers deliver only **~35% cost savings at best** (<2% accuracy loss), most
   **over-rely on the strongest model**, and **commercial routers do not beat open-source** (NotDiamond
   ranks *last* of 12). Lead P3 with **manual task-class right-sizing** (reliable) and treat auto-routers as
   "modest, imperfect." An emerging **coding-specific** approach — trajectory/escalation routing
   (SWE-Router) — is more promising than routing on the task description alone. [Lead]
3. **Elevate a technique the draft under-weighted: tool-output / dev-loop-noise filtering.** Wrapping
   noisy commands (`git status`, `npm test`, build logs) with a hook that strips output before it reaches
   the model reportedly cuts **60–90% of dev-loop output tokens** — a low-effort, high-value L1 change. [Lead]
4. **"Cost per passing task" is now measurable off public leaderboards.** SWE-bench Verified publishes
   **$ per instance** next to resolved-%. This upgrades P8 (eval) and P3 (open-weight substitution) from
   aspiration to "read it off a board, then confirm on your own repos" — and gives us benchmark anchors.
5. **Observability is first-class now.** Claude Code emits native OpenTelemetry; `ccusage` covers 15+ CLIs
   locally. P1 no longer needs "custom tooling" framing.
6. **A pricing change at our launch window.** Claude **Sonnet 5 introductory pricing ($2/$10) ends Aug 31 2026**,
   rising ~50% to **$3/$15 on Sep 1**. We launch in September — build every cost model and benchmark on
   **post-Sept pricing**, date-stamped.

---

## The diff, pillar by pillar

### P1 — Measure & Attribute → **CONFIRMED + concretized**
- **[Verified 3-0]** Claude Code emits **native OpenTelemetry** metrics (`CLAUDE_CODE_ENABLE_TELEMETRY=1`),
  ingestible by CloudWatch (OTLP endpoint now GA, bearer-token auth). Dashboard-ready metric names:
  `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.session.count`, with token usage split
  by `input` / `output` / `cacheRead` / `cacheCreation`.
- **[Verified 3-0]** `ccusage` reads usage **from local JSONL** (no vendor dashboard, offline mode), supports
  **15+ agent CLIs** (Claude Code, Codex, Gemini CLI, Copilot CLI, Qwen, Kimi, Goose, Amp…), and reports by
  daily/weekly/monthly/session/project/model + Claude Code 5-hour billing windows. *Caveat:* local-only —
  team aggregation means running per-machine and combining externally (a gateway does this better; see P7).
- **[Verified 3-0]** `/usage` gives per-session attribution to skills/subagents/plugins/individual MCP servers
  (each as % of total) and flags long-context / cache-miss when one is ≥10% of recent usage.
- **Take:** P1 keeps its "foundation" spot; swap generic "observability" for these concrete, named levers.

### P2 — Plan & Pricing Arbitrage → **CONFIRMED, with a time-cliff and a billing-model change**
- **[Verified 3-0]** **Claude Sonnet 5 intro pricing $2/$10 per MTok ends Aug 31 2026 → $3/$15 on Sep 1** (~50% jump).
- **[Verified 3-0]** **GitHub Copilot moved to usage-based billing on June 1 2026** — premium-request units (PRUs)
  replaced by token-based **"AI Credits"** (1 credit = $0.01) consumed by input/output/**cached** tokens at
  published per-model API rates; **code completions don't consume credits**. → The old per-seat/PRU mental model
  is obsolete; model choice + context size + cache behavior now drive Copilot spend directly.
- **[Verified 3-0]** **Batch API = 50% off input & output, and stacks with prompt-cache discounts** — but it's
  **async-only and explicitly not available for interactive/stateful agent sessions.** So the batch lever helps
  only **offline** coding work (bulk evals, offline refactors, PR triage), *not* live coding loops. Narrow the claim.
- **[Refuted 0-3] Do not use:** "each Copilot tier's AI-Credit allotment equals its dollar price." False — e.g.
  Pro is $10/mo but includes ~$15 (1,500 credits). Get exact allotments from GitHub docs at write time.

### P3 — Model Choice & Routing → **UPDATE**
- **[Verified 3-0]** **RouterArena (ICLR 2026, Rice Univ.)** — first open router benchmark (~8,400 queries, 9
  domains): best routers (**vLLM-SR, CARROT**) get **~35% lower cost at <2% accuracy loss**; **most routers
  over-rely on the strongest model** (cluster near 100% cost/accuracy) vs an **~85% oracle** headroom;
  **no router combines low cost + high accuracy**; **commercial ≯ open-source** (GPT-5 built-in router #7 —
  restricted to OpenAI pool; **NotDiamond #12/last**). *Caveat:* general-domain, **not coding-specific** —
  directional for us, not proven on coding.
- **[Verified 3-0]** **Gateways are the substitution mechanism.** Claude Code honors `ANTHROPIC_BASE_URL` /
  `ANTHROPIC_CUSTOM_HEADERS` with zero code change. **Bifrost** rewrites Claude Code's `sonnet-model`/`haiku-model`
  labels to *any* provider (Anthropic, Bedrock, Vertex, Azure, OpenAI, Gemini) at request time — central routing
  without touching each dev's config. *Caveat:* non-Anthropic models lose extended-thinking / web-search /
  computer-use / citations parity and must support tool calling.
- **[Lead]** **SWE-Router** — coding-specific **temporal/value-based routing**: a cheap model runs a few
  exploratory turns, then its partial trajectory decides whether to continue cheap or escalate. More promising
  for agents than routing on the task description alone. (arXiv, chase for numbers.)
- **[Lead]** OpenWeight substitution economics are real: **DeepSeek V4 Pro 80.6% SWE-bench Verified, MIT license,
  ~$0.435/$0.87 per MTok**; **DeepSeek V4-Flash ~$0.09/$0.18** vs GPT-5.5 ~$5/$30. (Secondary/blog — verify prices.)
- **Take:** restructure P3 into three tiers of confidence: **(a) manual task-class right-sizing** (reliable,
  lead here), **(b) auto query-routers** (modest ~35%, poor selection common — set expectations),
  **(c) trajectory/escalation routing** (emerging, coding-native — flag as frontier). Keep gateways under P7 as
  the *mechanism*.

### P4 — Context Engineering → **CONFIRMED + one addition + real evidence**
- **[Lead] Add as first-class technique: tool-output / dev-loop-noise filtering.** AutoScout24 (170-eng org,
  practitioner post, Jun 2026): hooks that strip noisy command output (`git status`, `npm test`, build logs)
  before it reaches the model → **60–90% reduction in dev-loop output tokens**. Anthropic's own docs echo this
  (a hook that greps a 10k-line log down to matching lines: tens-of-thousands → hundreds of tokens). This is a
  low-effort, high-value L1 change we hadn't listed.
- **[Verified 3-0]** **MCP tool definitions are deferred by default** in Claude Code (only names load until a tool
  is used) — *updates* the "MCP servers bloat context" framing; guidance is now "plain CLI tools (`gh`, `aws`,
  `gcloud`) still beat MCP servers because they add no per-tool listing." Keep MCP discipline, change the reason.
- **[Verified 3-0]** Keep **CLAUDE.md under ~200 lines** (essentials only; move workflow detail into on-demand skills).
- **[Lead] Published before/after numbers now back this pillar:** SWE-Pruner (0.6B "skimmer" for task-aware code
  pruning) → **31% fewer tokens at 64% vs 62% success**; "Focus" agent-driven compression → **22.7% token
  reduction (14.9M→11.5M) at identical accuracy**. (arXiv — good benchmark hypotheses for D3.)
- **Take:** P4 remains a major lever; add tool-output filtering; re-word MCP; cite the numbers.

### P5 — Caching Discipline → **CONFIRMED + precise economics**
- **[Verified 3-0]** Claude API prompt-cache: **read = 0.1× base input; 5-min write = 1.25×; 1-hr write = 2×.**
  Break-even: after **1 read** (5-min TTL) or **2 reads** (1-hr TTL).
- **[Verified 3-0]** **Cache lifetime depends on billing path in Claude Code**: **1 hr on subscription; 5 min on
  usage credits or API key/cloud.** `ENABLE_PROMPT_CACHING_1H=1` keeps 1 hr on usage credits. A break longer than
  the TTL → full-context reprocessing (cache miss). This is a concrete cache-cadence knob.
- **Take:** add the exact multipliers and the TTL-by-billing-path knob to the P5 pages.

### P6 — Workflow & Agent-Loop Discipline → **CONFIRMED + subagent-cost caution**
- **[Verified 3-0]** **Agent teams use ~7× the tokens** of a standard session in plan mode (each teammate = its own
  context window / separate instance). Subagents help (context isolation, P4) but cost tokens if overused;
  carry the 7× number as a caution.
- **[Lead]** OpenRouter macro framing for the intro: **coding agents = ~40% of tracked gateway tokens** (2.90T,
  week ending 2026-05-08) and **agentic requests use ~15× more tokens/request** than human-interactive. Useful
  context for the intro of the CTO playbook.

### P7 — Team Practices & Governance → **CONFIRMED (gateways are the mechanism)**
- **[Verified 3-0]** **LiteLLM** gives per-customer budgets (`x-litellm-customer-id`) and tag-based per-project /
  per-team / per-environment attribution (`x-litellm-tags`) for Claude Code via custom headers — off-the-shelf,
  no tool modification. This is the enforcement layer for standardized configs + spend governance.
- **Take:** P7 = "route everyone through a governed gateway" is now concrete and citable (LiteLLM/Bifrost).

### P8 — Quality & Evaluation → **CONFIRMED + upgraded**
- **[Verified 3-0]** SWE-bench Verified **bash-only** board (fixed minimal `mini-SWE-agent` scaffold) publishes
  **$/instance**: open-weight **MiniMax M2.5 = 75.8% @ $0.073** vs top **Claude 4.5 Opus = 76.8% @ $0.754**
  (~1 pt lower at **~1/10th** the per-task cost); Gemini 3 Flash 75.8% @ $0.356.
- **[Verified 2-1]** Main Verified board: **DeepSeek V3.2 Reasoner 60.0% @ $0.028** vs **Claude 4 Opus 67.6% @ $1.13**.
- **[Refuted 1-2] Do not use:** the "Feb-2026 harness" open-weight snapshot (GLM 5 72.8%, Kimi K2.5 70.8%) —
  killed on harness/date-consistency grounds. **Cite only the entries above, with the read date.** Cost/trajectory
  data exists **only for `mini-SWE-agent` submissions**, so **cross-harness cost comparisons are invalid.**
- **[Lead]** **HAL** harness: parallel agent evals across many VMs, weeks→hours — relevant to "how a company builds
  its own eval set" (Csongor's ask).
- **Take:** P8 gets a concrete method — read cost-per-passing-task off a public board to *shortlist* models, then
  gate the swap on your own golden-task eval. Anchors above calibrate our D3.

---

## Verified data anchors (for the benchmark + playbook)

| Fact | Number | Verify | Source (accessed 2026-08-10) |
|---|---|---|---|
| Claude Code enterprise spend | ~$13/dev/active-day; $150–250/dev/mo; 90% <$30/day | 3-0 *(vendor self-reported)* | code.claude.com/docs/en/costs |
| Sonnet 5 pricing cliff | $2/$10 → $3/$15 on **Sep 1 2026** | 3-0 | platform.claude.com/docs/en/about-claude/pricing |
| Prompt-cache economics | read 0.1×, 5-min write 1.25×, 1-hr write 2× | 3-0 | platform.claude.com …/pricing |
| Cache TTL (Claude Code) | 1 hr subscription / 5 min usage-credits or API | 3-0 | code.claude.com/docs/en/costs |
| Batch API | 50% off in+out, stacks w/ caching, **async-only** | 3-0 | platform.claude.com …/pricing |
| Agent teams cost | **~7×** tokens (plan mode) | 3-0 | code.claude.com/docs/en/costs |
| Router savings ceiling | **~35%** best case, <2% acc. loss; ~85% oracle | 3-0 | RouterArena, ICLR 2026 |
| Open-weight cost/task | MiniMax M2.5 75.8% @ $0.073 vs Opus 4.5 76.8% @ $0.754 | 3-0 | swebench.com/verified.html |
| Copilot billing | PRUs → token-based AI Credits, **Jun 1 2026** | 3-0 | github.blog / docs.github.com |

## Leads to chase (extracted, **not** adversarially verified)

- **Tool-output filtering → 60–90% dev-loop output reduction** — AutoScout24 eng blog (Jun 2026). *Highest-value lead.*
- **SWE-Router** (temporal/escalation routing, coding-specific) — arXiv 2607.00053.
- **SWE-Pruner** (0.6B skimmer, 31% fewer tokens, 64% vs 62%) — arXiv 2601.16746.
- **"Focus"** context compression (22.7% token cut, same accuracy) — arXiv 2601.07190.
- **DeepSeek V4 Pro / V4-Flash** pricing & 80.6% SWE-bench — marktechpost / OpenRouter blog (verify prices).
- **OpenRouter macro:** coding = ~40% of tokens; agentic ~15×/request — OpenRouter insights.
- **HAL** parallel eval harness — arXiv 2510.11977.

## Caveats & maintenance

- **Time-sensitivity dominates.** Sonnet intro pricing ends Aug 31; Copilot promo window June 1–Sep 1. Date-stamp
  every price and re-verify quarterly (Part 1's exact maintenance risk).
- **Leaderboard churn.** SWE-bench numbers/rankings move; cost data is only for `mini-SWE-agent` runs; never compare
  costs across harnesses. One broader open-weight snapshot was refuted on exactly this.
- **RouterArena is general-domain**, not coding — its conclusions are directional for coding agents, not proven.
- **Anthropic $13/dev/day is vendor self-reported**, methodology undisclosed ("active day" undefined). Use as
  directional only.
- **Gateway claims are config-mechanism verified**, but real-world cost-savings magnitude *for coding* isn't quantified.

## Open questions (carry into the Rony/Csongor review)

1. **Coding-specific router numbers.** RouterArena is general-domain; SWE-Router is a lead. Our D3 could produce
   the missing coding-specific routing datapoint. (Csongor's benchmarking mandate fits perfectly here.)
2. **Context-engineering before/after on real repos** — we have leads (60–90%, 31%, 22.7%) but no independent
   coding-team case study. Another gap D3 can fill with primary data.
3. **Non-Claude-Code tools' economics** (Cursor / Copilot agent / Cline / Aider / Windsurf caching, subagent,
   "auto" model modes) — verified evidence skewed heavily to Claude Code. Confirms our Claude-Code-centric benchmark
   choice, but the playbook needs at least tool-equivalence notes.
4. **End-to-end open-weight substitution with retained quality** — leaderboard cost/task is proven; real team
   case studies weren't found. Our eval-gated-swap method (P8) is the answer to sell here.

## Sources (quality-rated)

**Primary:** platform.claude.com/docs/…/pricing · code.claude.com/docs/en/costs · code.claude.com/docs/en/monitoring-usage ·
code.claude.com/docs/en/env-vars · code.claude.com/docs/en/llm-gateway · github.blog (Copilot billing) ·
docs.github.com/…/usage-based-billing · RouterArena (ICLR 2026 PDF) · swebench.com/verified.html +
github.com/SWE-bench/swe-bench.github.io · docs.litellm.ai/…/claude_code_customer_tracking · docs.getbifrost.ai/cli-agents/claude-code ·
github.com/ryoppippi/ccusage · aws.amazon.com/blogs/mt (CloudWatch+OTel) · arXiv 2601.16746, 2601.07190, 2510.11977, 2607.00053.
**Secondary/blog (leads, verify before citing):** vantage.sh (Cursor pricing) · openrouter.ai/blog/insights ·
tech.autoscout24.com (dev-loop techniques) · marktechpost (open MoE comparison) · braintrust.dev (router roundup).
**Rated unreliable / dropped:** morphllm.com (×2), gradually.ai changelog.
