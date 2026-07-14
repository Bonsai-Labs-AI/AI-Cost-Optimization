---
title: "Cost Regression Tests"
category: visibility-measurement
maturityLevel: 2
maturityProvisional: false
shortDescription: "A CI/CD gate that runs a fixed set of canonical prompts, sums the tokens/dollars, and fails the build when cost per request rises past a committed baseline — the cost analogue of a performance regression test."
effort: Medium
gain: Medium
riskToQuality: Low
detectionSignals:
  - "Prompt and model changes ship with no cost check — the first signal of a regression is next month's invoice."
  - "Cost per request creeps up release over release and nobody owns 'why did it go up.'"
  - "A prompt edit, an added tool description, a bumped retrieval-k, or a reasoning-effort default silently bloated the input with no gate to catch it."
  - "You have a quality eval suite in CI but it only scores answers, not tokens or dollars."
measurementMethods:
  - "Cost-regression gate present in CI (non-zero exit on >X% cost increase vs. a committed baseline)."
  - "% of prompt/model/config changes that pass through the gate."
  - "Cost-creep incidents caught pre-merge vs. discovered in production."
  - "Per-canonical-prompt token and $ delta reported on each PR."
status: published
lastUpdated: "2026-07-02"
related:
  - "visibility-measurement/quality-cost-evaluation-suite"
  - "visibility-measurement/cost-anomaly-detection"
  - "visibility-measurement/cache-hit-rate-instrumentation"
  - "caching-reuse/prompt-caching-prefix-caching"
sources:
  - id: promptfoo-assertions
    title: "Assertions and Metrics — LLM Output Validation"
    publisher: "Promptfoo Docs"
    year: 2026
    url: "https://www.promptfoo.dev/docs/configuration/expected-outputs/"
    accessed: "2026-07-02"
    kind: docs
    note: "The `cost` assertion fails a test case when the model-call cost exceeds a numeric threshold (e.g. threshold: 0.001); a `latency` assertion does the same for response time. tokensUsed (total/prompt/completion) is exposed to custom scorers."
  - id: promptfoo-cicd
    title: "CI/CD Integration for LLM Eval and Security"
    publisher: "Promptfoo Docs"
    year: 2026
    url: "https://www.promptfoo.dev/docs/integrations/ci-cd/"
    accessed: "2026-07-02"
    kind: docs
    note: "Runs as a CLI in any CI system; failing assertions return a non-zero exit code to fail the build. Results cache between runs (PROMPTFOO_CACHE_PATH/TTL); JSON/HTML/JUnit-XML output; --fail-on-error."
  - id: promptfoo-gha
    title: "GitHub Action for LLM evaluation"
    publisher: "Promptfoo Docs"
    year: 2026
    url: "https://www.promptfoo.dev/docs/integrations/github-action/"
    accessed: "2026-07-02"
    kind: docs
    note: "promptfoo/promptfoo-action@v1 runs a before-vs-after evaluation when monitored prompt files change and posts a comparison comment on the PR."
  - id: braintrust-cicd
    title: "Best AI Eval Tools for CI/CD Pipelines (2026 Review)"
    publisher: "Braintrust"
    year: 2026
    url: "https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025"
    accessed: "2026-07-02"
    kind: docs
    note: "Eval GitHub Action runs experiments on a PR, compares against a production baseline, posts per-case deltas (which regressed, by how much), and can block the merge when a threshold isn't met."
  - id: nroan-cache-regression
    title: "Autoscaling Hid Our LLM Cost Regression (85% → 4% Cache Hit Rate)"
    publisher: "Nick Roan (Medium)"
    year: 2026
    url: "https://medium.com/@nroan/autoscaling-hid-our-llm-cost-regression-85-4-cache-hit-rate-b4beab5df240"
    accessed: "2026-07-02"
    kind: blog
    note: "A one-line chunk-size change (512→500 tokens) shifted token boundaries, collapsing vLLM prefix-cache hit rate 85%→4% and needing 80% more GPU replicas at the same traffic. Latency stayed flat (autoscaling masked it); fixed with a two-phase replay CI gate on cache-hit-rate and recomputed-token volume."
  - id: truefoundry-agentic-ci
    title: "Agentic Token Explosion: How to Attribute, Budget, and Control LLM Costs When AI Runs in CI/CD"
    publisher: "TrueFoundry"
    year: 2026
    url: "https://www.truefoundry.com/blog/llm-cost-attribution-agentic-cicd"
    accessed: "2026-07-02"
    kind: blog
    note: "Agent token use grows ~O(n²) in steps; a Claude Code review agent cost $8,400 in month one (~400k input tokens/PR) because a 50k-token manual was injected every PR (92% of cost); switching to cached prompts cut month two to under $800."
  - id: llm-cost-tool
    title: "llm-cost — static cost analysis for LLM workloads"
    publisher: "GitHub — Rul1an/llm-cost"
    year: 2026
    url: "https://github.com/rul1an/llm-cost/"
    accessed: "2026-07-02"
    kind: repo
    note: "Offline tiktoken-based cost estimator with a built-in pricing DB; `check --budget`, `diff` between git refs, `fail-on-increase`, and a GitHub Action that comments cost diffs on PRs — 'like Infracost, but for AI.'"
  - id: kinde-ci-evals
    title: "CI/CD for Evals: Running Prompt & Agent Regression Tests in GitHub Actions"
    publisher: "Kinde"
    year: 2026
    url: "https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/ci-cd-for-evals-running-prompt-and-agent-regression-tests-in-github-actions/"
    accessed: "2026-07-02"
    kind: blog
    note: "Practitioner walkthrough of a GitHub Actions workflow that analyzes cost (token usage) and latency of responses and fails the check when they exceed preset budgets."
---

## Overview

Teams treat quality regressions as build-breaking events — a failing test blocks the merge —
but treat *cost* regressions as something you discover on the monthly invoice. In an LLM
product, the two failure modes are symmetric: a prompt edit that quietly doubles input tokens
is as much a defect as one that drops answer accuracy, and both are cheapest to catch before
the change ships.

A **cost regression test** is a CI/CD gate that makes cost a first-class, blocking metric. It
runs a fixed set of canonical prompts (ideally the same golden set the quality eval suite runs
against), sums the tokens and dollars each one consumes, compares the total to a committed
baseline, and **fails the build when cost per request rises beyond a threshold**.[^promptfoo-assertions][^llm-cost-tool]
It is the direct analogue of a performance regression test: you would never let a change that
adds 200 ms of p95 latency merge unnoticed, and this applies the same discipline to `$`/request.

The reason this sits at **Level 2** rather than Level 3 is that off-the-shelf eval tooling now
makes it a config exercise rather than custom infrastructure. Promptfoo ships a `cost`
assertion type; Braintrust and promptfoo both provide GitHub Actions that run the suite on a PR
and post per-case deltas; a static estimator like `llm-cost` can `diff` cost between two git
refs and fail on an increase — no bespoke pipeline required.[^promptfoo-assertions][^braintrust-cicd][^llm-cost-tool]
What it does *not* do is cut current spend — its value is preventing the slow, invisible creep
that erodes the savings every other technique in this catalog buys you.

## Detailed Approach & Techniques

### The core loop

Every cost regression check is the same four steps:

1. **Run N canonical prompts** — a small, representative, version-controlled set (10–100 cases)
   covering the real task types. Reuse the golden set from the *Quality–Cost Evaluation Suite*
   so quality and cost are judged on identical inputs.
2. **Capture tokens and cost per case.** Every provider returns a usage object (input,
   output, cached, and — on reasoning models — reasoning tokens); price it, or let the tool do
   it from a built-in pricing database.[^promptfoo-assertions][^llm-cost-tool]
3. **Compare to a committed baseline** — a stored `main`-branch total (or per-case) figure.
4. **Fail the build on a >X% increase.** The tool exits non-zero, the CI job goes red, and the
   PR is blocked (or annotated) until a human looks.[^promptfoo-cicd][^llm-cost-tool]

### Wiring it into CI with off-the-shelf tools

- **Promptfoo `cost` assertion.** The simplest gate: attach `type: cost` with a numeric
  `threshold` (e.g. `threshold: 0.001` USD) to a test case; the assertion fails when the
  call's cost exceeds it, and a failing assertion returns a non-zero exit code that fails the
  CI job (`--fail-on-error`). A parallel `latency` assertion does the same for response time,
  and `tokensUsed` (total/prompt/completion) is available to custom scorers for finer-grained
  token gates.[^promptfoo-assertions][^promptfoo-cicd] The `promptfoo/promptfoo-action@v1`
  GitHub Action runs a **before-vs-after** evaluation when monitored prompt files change and
  posts the comparison on the PR — the reviewer sees the cost delta inline.[^promptfoo-gha]
- **Braintrust eval action.** Runs the eval suite on the PR, compares against a production
  baseline, and posts per-case deltas ("which regressed, by how much"); a failed threshold can
  block the merge. The same experiment record can carry cost alongside score.[^braintrust-cicd]
- **Static cost diff (no API calls).** `llm-cost` tokenizes prompt files offline (tiktoken
  pricing DB), and its `diff` between two git refs plus a `check --budget` / `fail-on-increase`
  GitHub Action comments the cost delta on the PR — the "Infracost for AI" pattern that catches
  a bloated prompt *before* any tokens are spent.[^llm-cost-tool]
- **Practitioner GitHub Actions recipe.** A minimal workflow analyzes the token cost and
  latency of responses on each commit and fails the check when they exceed preset
  budgets — the whole gate is a YAML step plus a threshold.[^kinde-ci-evals]

### What silent cost creep this catches

The gate exists because these changes look harmless in a code review but move the meter:

- **A system-prompt edit** that adds a paragraph or a new few-shot example — paid on *every*
  call thereafter.
- **A model bump** to a pricier tier, or a **reasoning-effort default** flipped from `low` to
  `high`, inflating (billed) reasoning/output tokens.
- **An added tool description** in an agent — tool schemas are resent every step, so a verbose
  new tool compounds across a loop.[^truefoundry-agentic-ci]
- **A retrieval-k increase** ("bump to top-10 to be safe") that quietly triples generation-context
  tokens.
- **A cache-invalidating change.** The sharpest real example: a one-line chunk-size change from
  512 to 500 tokens shifted token boundaries and collapsed a vLLM prefix-cache hit rate from
  **85% to 4%**, requiring **80% more GPU replicas** at identical traffic. Latency stayed flat
  because autoscaling absorbed it — a pure cost regression, invisible to every functional test.
  The team's fix was exactly a CI gate: a two-phase replay measuring prefix-cache-hit-rate and
  recomputed-token volume, treating cache efficiency as a release-quality gate.[^nroan-cache-regression]

Agentic workloads make the stakes larger: token use grows roughly **O(n²)** in the number of
steps, so a small per-step bloat explodes over a run. One team's Claude Code review agent cost
**$8,400** in its first month (~400k input tokens per PR) because a 50k-token manual was
injected on every PR — 92% of the pipeline's cost — a regression a token gate would have
flagged on the PR that introduced it.[^truefoundry-agentic-ci]

### Baseline management

The one thing to get right is distinguishing **intentional** cost increases from accidental
drift:

- **Commit the baseline.** Store the accepted token/$ figures in the repo (a fixture file or a
  stored experiment) so the diff is deterministic and reviewable.[^braintrust-cicd][^llm-cost-tool]
- **Make raising it a deliberate act.** When a change legitimately costs more (a better model, a
  needed context expansion), the same PR updates the baseline — so the increase is *reviewed and
  approved*, not silently absorbed. The gate's job is to force that conversation, not to forbid
  all growth.
- **Set the threshold as a band, not zero.** LLM token counts have run-to-run variance
  (sampling, minor formatting); a ±3–5% tolerance avoids flaky failures while still catching a
  real 30% jump.
- **Cache eval results** between runs to keep the gate cheap and fast, and to avoid the gate
  itself becoming a token-cost line item.[^promptfoo-cicd]

## Example Where It Works

A B2B support-assistant team ships prompt and retrieval changes several times a week. They add
a promptfoo suite of 40 canonical tickets to CI with a per-case `cost` threshold and a total
that must stay within 5% of the committed `main` baseline; the `promptfoo-action` posts the
before/after cost on every PR.[^promptfoo-assertions][^promptfoo-gha]

A developer opens a PR that reorders the system prompt to "improve tone," inadvertently moving a
per-request timestamp above the large static policy block. Functionally the answers are fine and
the quality eval passes — but the reordering breaks the prompt-cache prefix, and the cost gate
shows input cost per ticket jumping ~40% because the previously-cached 6k-token block is now
recomputed on every call. CI goes red, the reviewer sees the delta inline, the timestamp is
moved back below the static block, and a cache regression that would otherwise have surfaced only
as a fatter invoice weeks later is fixed in the PR — for the price of a YAML assertion.[^nroan-cache-regression]
The gain here is not a cut to current spend but the *preservation* of the savings that prompt
caching already delivers.[^kinde-ci-evals]

## Example Where It Would NOT Work

- **No representative canonical set.** For a highly open-ended product (free-form creative
  chat) where no small fixed prompt set represents real traffic, the gate's numbers don't track
  production cost — it will pass changes that are expensive in the wild and flake on ones that
  aren't. Here, production-side *Cost Anomaly Detection* on live traffic is the right instrument,
  not a CI fixture.
- **Cost dominated by inputs the test can't see.** If per-request cost is driven mostly by
  user-supplied document size or conversation length — variables absent from the canonical
  prompts — a change that mishandles large inputs sails through the gate. The gate measures the
  *prompt/config* surface, not the input distribution.
- **Non-deterministic spend with a too-tight threshold.** Reasoning models and sampling produce
  genuine run-to-run token variance; a zero-tolerance gate turns into a flaky, ignored red
  build — the classic way a well-intended check gets `|| true`'d into uselessness. Without a
  sensible tolerance band and an owned baseline-update process, the test is worse than none.
- **Pre-foundation teams.** If a client has no quality eval suite and no committed golden set,
  standing up a cost gate first is premature — cost must be judged *together with* quality, or a
  green cost gate just rewards a change that got cheaper by getting worse. Build the
  *Quality–Cost Evaluation Suite* first; the cost regression test is the gate that runs against
  it.[^braintrust-cicd]

[^promptfoo-assertions]: Promptfoo Docs, "Assertions and Metrics — LLM Output Validation" — <https://www.promptfoo.dev/docs/configuration/expected-outputs/>
[^promptfoo-cicd]: Promptfoo Docs, "CI/CD Integration for LLM Eval and Security" — <https://www.promptfoo.dev/docs/integrations/ci-cd/>
[^promptfoo-gha]: Promptfoo Docs, "GitHub Action for LLM evaluation" — <https://www.promptfoo.dev/docs/integrations/github-action/>
[^braintrust-cicd]: Braintrust, "Best AI Eval Tools for CI/CD Pipelines (2026 Review)" — <https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025>
[^nroan-cache-regression]: Nick Roan, "Autoscaling Hid Our LLM Cost Regression (85% → 4% Cache Hit Rate)," Medium — <https://medium.com/@nroan/autoscaling-hid-our-llm-cost-regression-85-4-cache-hit-rate-b4beab5df240>
[^truefoundry-agentic-ci]: TrueFoundry, "Agentic Token Explosion: How to Attribute, Budget, and Control LLM Costs When AI Runs in CI/CD" — <https://www.truefoundry.com/blog/llm-cost-attribution-agentic-cicd>
[^llm-cost-tool]: GitHub, "Rul1an/llm-cost — static cost analysis for LLM workloads" — <https://github.com/rul1an/llm-cost/>
[^kinde-ci-evals]: Kinde, "CI/CD for Evals: Running Prompt & Agent Regression Tests in GitHub Actions" — <https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/ci-cd-for-evals-running-prompt-and-agent-regression-tests-in-github-actions/>
