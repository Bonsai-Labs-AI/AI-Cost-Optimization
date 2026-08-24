---
title: "Async / cloud background agents"
group: workflow
level: 3
costLever: [calls, turns, plan]
effort: Medium
savingEstimate: "varies — a batching lever, not a discount"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - cursor
  - codex
  - copilot
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/deterministic-orchestration"
  - "context/tool-output-filtering"
sources:
  - id: devin-acu
    title: "How Cognition defines ACUs (Agent Compute Units)"
    publisher: "Devin Docs (Cognition)"
    url: "https://docs.devin.ai/admin/billing/usage"
    accessed: "2026-08-10"
    kind: docs
    note: "ACU = normalized measure of Devin's compute (VM time, model inference, networking) per session; ~15 min of active work per ACU."
  - id: devin-pricing
    title: "Cognition AI pricing explained — Devin Team plan ACUs and overage"
    publisher: "eesel AI (practitioner pricing roundup)"
    url: "https://www.eesel.ai/blog/cognition-ai-pricing"
    accessed: "2026-08-19"
    kind: blog
    verify: true
    note: "Team plan $500/mo = 250 ACUs, additional ACUs ~$2 each (1 ACU ≈ 15 min of active work). Practitioner-aggregated — confirm against Devin's live pricing page."
  - id: copilot-agent
    title: "Copilot coding agent — GitHub Actions minutes + premium requests"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent"
    accessed: "2026-08-10"
    kind: docs
    note: "Coding (cloud) agent consumes GitHub Actions minutes plus AI Credits / one premium request per session (× the model's rate); each steering comment adds one more."
  - id: copilot-move
    title: "GitHub Copilot is moving to usage-based billing"
    publisher: "The GitHub Blog"
    url: "https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/"
    accessed: "2026-08-10"
    kind: blog
    note: "PRUs → token-based AI Credits (1 credit = $0.01), effective Jun 1 2026."
  - id: cursor
    title: "Cursor Cloud Agents"
    publisher: "Cursor Docs"
    url: "https://cursor.com/docs/cloud-agent"
    accessed: "2026-08-10"
    kind: docs
    note: "Started from Slack/web/GitHub/Linear/API; work on a branch and open merge-ready PRs; charged at API pricing for the selected model; set a spend limit on first use."
  - id: codex
    title: "OpenAI Codex pricing — cloud tasks and token-based credits"
    publisher: "CloudZero / eesel (practitioner pricing roundups)"
    url: "https://www.cloudzero.com/blog/openai-codex-pricing/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "Codex Cloud tasks run in hosted containers; metered as token-based credits (per-message pricing retired Apr 2 2026) plus a container fee; Plus ~10–60 cloud tasks per 5-hr window. Practitioner-aggregated — confirm against OpenAI's live plan page."
  - id: batch
    title: "Batch API — 50% off, async-only"
    publisher: "Claude API pricing docs (via RESEARCH_FINDINGS.md)"
    url: "https://platform.claude.com/docs/en/about-claude/pricing"
    accessed: "2026-08-10"
    kind: pricing
    note: "Batch API = 50% off input & output, stacks with prompt-cache discounts, but async-only and not available for interactive/stateful agent sessions."
  - id: agent-teams
    title: "Agent teams use ~7× the tokens of a standard session"
    publisher: "Claude Code docs — Manage costs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Parallel agent instances each carry their own context window; vendor self-reported."
---

## What & why

A hosted background agent (Cursor Cloud, Codex Cloud, Copilot coding agent, Devin) runs a coding
task unattended on the vendor's infrastructure and opens a pull request when it's done. The cost
point is that these agents **meter differently from your interactive session** and run a full
autonomous loop per task, so a single job can cost the equivalent of many interactive requests. The
lever is not a discount — it's *which work you send to them and how many runs you allow*. Used for
well-scoped, batchable jobs they parallelize work; used for trivial edits they burn a whole
autonomous loop on something an inline edit would have done for a fraction of the tokens.

## How to do it

The portable practice is the same across vendors:

1. **Learn the meter for the tool you use.** Each product prices this work on its own unit, and they
   are not comparable to your per-message interactive cost. See this technique's row in
   `TOOL_MATRIX.md` for the exact unit and knob per tool. In short: Devin bills in **ACUs** (Agent
   Compute Units — a normalized measure of VM time, model inference, and networking, roughly 15
   minutes of active work per ACU; the Team plan is ~$500/mo for ~250 ACUs, extra ACUs ~$2
   each).[^devin-acu][^devin-pricing] Copilot coding agent consumes **GitHub Actions minutes plus AI
   Credits**, billed as one premium request per session (× the model's rate), with each steering
   comment adding one more.[^copilot-agent][^copilot-move] Cursor Cloud and Codex Cloud meter at
   **token-based API pricing** for the selected model, plus a container/compute fee.[^cursor][^codex]

2. **Send only jobs that fit the format.** A background agent earns its cost on work that is
   well-scoped, verifiable by CI, and parallelizable: dependency bumps, mechanical refactors across
   many files, lint/type-error sweeps, test backfill, framework migrations, first-pass fixes on a
   backlog of small issues. These are also the jobs the Batch API's async-only 50% discount covers
   for offline work — background agents live in the same "async, not interactive" lane.[^batch]

3. **Do not use them for trivial edits.** A one-line change, a quick question, or anything you'd
   finish in one inline turn should stay in the interactive session. A background run spins up a
   container and a full plan-act-verify loop; that overhead is the whole point for a big job and pure
   waste for a small one.

4. **Cap the number of runs.** The spend driver is run count × per-run loop cost. Set the vendor's
   spend limit, batch related issues into one well-specified task instead of firing one agent per
   ticket, and review the PR before you let a re-run happen — a vague spec that produces a wrong PR
   costs you the whole loop twice.

## When it's worth it / when not

- **Worth it:** batches of well-scoped, independent, CI-verifiable work you can run in parallel and
  review as PRs — dependency upgrades, wide mechanical refactors, lint/type sweeps, test backfill,
  triaging a backlog of small bugs. The value is throughput (many jobs at once, off your machine),
  not a lower per-token price.
- **Worth it:** work that maps cleanly to the async lane, where you don't need to steer mid-task.
- **Not worth it:** trivial or one-off edits, exploratory work, or anything needing tight
  back-and-forth — every steering comment on Copilot's agent is another premium request,[^copilot-agent]
  and interactive coding is exactly what these are *not* priced for.
- **Not worth it:** vague or under-specified tasks. An autonomous loop on a bad spec produces a wrong
  PR at full loop cost, then you re-run.

## What it costs you

- **A different, easy-to-misread meter.** ACUs, AI Credits + Actions minutes, and token+container
  fees don't line up with your interactive per-message cost, so spend is easy to underestimate. One
  task can equal 20–50 interactive-request-equivalents. Read the meter before you scale run count.
- **Quality risk from unattended runs.** The agent commits a full PR without a human in the loop;
  a bad plan burns the whole loop before you see it. Mitigate with tight specs, CI gates, and PR
  review — never auto-merge.
- **Fan-out cost.** Parallel agents each carry their own context window; Anthropic reports agent
  teams use **~7× the tokens** of a single session.[^agent-teams] Firing one agent per ticket
  multiplies that. Batch related work into fewer, well-specified runs.
- **Setup effort.** Repo access, CI hooks, spend limits, and a review workflow are a one-time Medium
  setup; after that it's habit.

## How to verify

- Track **cost per merged PR** (or per completed task) in the vendor's usage view — ACUs/session for
  Devin, AI Credits + Actions minutes/session for Copilot, tokens + container fee/task for Cursor
  Cloud and Codex Cloud — and compare it to what the same work would cost in an interactive session.
- Watch **run count and re-run rate**: re-runs from bad specs are the silent cost. A rising re-run
  rate means the jobs you're sending aren't scoped tightly enough for the async lane.
- Confirm the **spend limit is set** and alerting before you increase throughput.

## Measured impact

_Not yet measured by us._ Benchmark: take one batch of well-scoped, CI-verifiable tasks (e.g. a set
of dependency bumps or a lint sweep) and run it two ways — as background/cloud agent jobs vs. the
same work done interactively — comparing cost per merged PR and wall-clock throughput. Report the
result as baseline (interactive) vs. the background-agent variant.

Cited context, not a savings claim: background agents meter in their own units (Devin ~$500/mo for
~250 ACUs, extra ACUs ~$2 each;[^devin-pricing] ⚠ practitioner-aggregated — confirm on Devin's live
pricing page), one task can equal roughly 20–50 interactive-request-equivalents, and parallel agent
teams cost ~7× a single session[^agent-teams] ⚠ (vendor self-reported). The async lane overlaps the
Batch API's 50%-off, async-only discount for offline work.[^batch]

[^devin-acu]: Devin Docs (Cognition), "How Cognition defines ACUs" — <https://docs.devin.ai/admin/billing/usage>
[^devin-pricing]: Practitioner pricing roundup (eesel AI), "Cognition AI pricing explained" — <https://www.eesel.ai/blog/cognition-ai-pricing> (⚠ Devin Team-plan ACU figures aggregated from practitioner sources; confirm on Devin's live pricing page)
[^copilot-agent]: GitHub Docs, "About Copilot coding agent" (Actions minutes + AI Credits / one premium request per session) — <https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent>
[^copilot-move]: The GitHub Blog, "GitHub Copilot is moving to usage-based billing" — <https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/>
[^cursor]: Cursor Docs, "Cloud Agents" (started from Slack/web/GitHub/API; open merge-ready PRs; charged at API pricing for the selected model; set a spend limit) — <https://cursor.com/docs/cloud-agent>
[^codex]: Practitioner pricing roundup (CloudZero), "OpenAI Codex pricing in 2026" — <https://www.cloudzero.com/blog/openai-codex-pricing/> (⚠ Codex Cloud token-credit + container-fee metering aggregated from practitioner sources; confirm on OpenAI's live plan page — link-check)
[^batch]: Claude API pricing docs — Batch API 50% off, async-only — <https://platform.claude.com/docs/en/about-claude/pricing>
[^agent-teams]: Claude Code docs, "Manage costs" — agent teams ~7× tokens (⚠ vendor self-reported) — <https://code.claude.com/docs/en/costs>
