---
title: "Code-review-bot cost discipline"
group: workflow
level: 1
costLever: [calls, input]
effort: Low
savingEstimate: "varies (fewer reviews × smaller diff)"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - copilot
  - claude-code
  - cursor
  - codex
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/deterministic-orchestration"
  - "context/tool-output-filtering"
sources:
  - id: cr-auto-review
    title: "Auto review configuration"
    publisher: "CodeRabbit docs"
    url: "https://docs.coderabbit.ai/configuration/auto-review"
    accessed: "2026-08-10"
    kind: docs
    note: "auto_review.drafts default false (skips drafts); auto_incremental_review default true (re-reviews after each push)."
  - id: cr-path-filters
    title: "Path filters and path instructions"
    publisher: "CodeRabbit docs"
    url: "https://docs.coderabbit.ai/configuration/path-instructions"
    accessed: "2026-08-10"
    kind: docs
    note: "reviews.path_filters; '!' prefix excludes a glob (e.g. !**/package-lock.json, !**/vendor/**)."
  - id: gh-cr-actions
    title: "GitHub Copilot code review will start consuming GitHub Actions minutes on June 1, 2026"
    publisher: "GitHub Changelog"
    url: "https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/"
    accessed: "2026-08-10"
    kind: docs
    note: "From Jun 1 2026 each review on a private repo also consumes Actions minutes (billed at standard rates beyond the included allotment), on top of AI Credits."
  - id: gh-multipliers
    title: "Model multipliers for annual plans on request-based billing (legacy)"
    publisher: "GitHub Docs"
    url: "https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/model-multipliers-for-annual-plans"
    accessed: "2026-08-10"
    kind: pricing
    verify: true
    note: "Copilot code review model multiplier = 13 (each review deducts 13 premium requests). Legacy request-based billing only; does NOT apply to usage-based AI Credits."
---

## What & why

A code-review bot fires on pull-request activity, and every review is a full agent call: it reads the
diff (plus context) and writes comments. Left on defaults it reviews draft PRs, re-reviews on every
push, and reads files no human reviews — lockfiles, vendored code, generated output. Each of those is a
billed call over a larger-than-necessary diff. The lever here is **fewer reviews over smaller diffs**:
cut the calls (skip drafts, review once per PR not per push) and cut the input per call (path-filter the
diff). On metered reviewers this maps straight to spend.

## How to do it

The portable moves, in order of payoff:

1. **Path-filter the diff.** Exclude files no reviewer reads — lockfiles (`package-lock.json`,
   `yarn.lock`, `pnpm-lock.yaml`), vendored dependencies (`vendor/**`), generated/build output
   (`dist/**`, `**/generated/**`), and large fixtures/snapshots. In CodeRabbit these are
   `reviews.path_filters` entries prefixed with `!` to exclude a glob.[^cr-path-filters] This shrinks
   input on every review and also removes the noise that produces low-value comments.
2. **Skip draft PRs.** A draft is still being written; reviewing it burns calls on a diff that will
   change. Review at "ready for review", not before (CodeRabbit skips drafts by default via
   `auto_review.drafts: false`).[^cr-auto-review]
3. **Review once per PR, not per push.** Incremental re-review on every push is the default on some
   bots (CodeRabbit's `auto_incremental_review` defaults to `true`) and multiplies calls across a PR's
   life.[^cr-auto-review] Turn it off, or trigger review on demand, so a busy PR is one review instead
   of ten.
4. **Match the reviewer's billing model to your volume.** Flat-rate per-seat reviewers (billed per
   active PR author, independent of review count) make cost predictable and de-couple it from push
   frequency. Metered reviewers bill per review/token, so the levers above translate directly into the
   invoice — and for those, watch the meters (below).

**Two-meter billing — the trap on Copilot code review.** As of **June 1 2026**, each Copilot code review
on a **private repo** consumes **GitHub Actions minutes** (billed at standard Actions rates once you pass
the included allotment) **on top of** the AI Credits every Copilot call already costs.[^gh-cr-actions] So
a noisy review policy shows up on two lines of the bill, not one. Separately, on the **legacy
request-based** plan the code-review feature carries a **model multiplier of 13** — each review deducts 13
premium requests.[^gh-multipliers] ⚠ That multiplier is a legacy-billing figure and does **not** apply to
the newer usage-based AI Credits model; check which plan your org is on before you use it to size spend.

See this technique's row in `TOOL_MATRIX.md` for the exact per-tool config keys.

## When it's worth it / when not

- **Worth it:** any team running an always-on review bot across many repos or high-PR-velocity repos —
  the defaults (drafts + per-push re-review + unfiltered diffs) are where the waste lives.
- **Biggest wins:** monorepos with big lockfiles/generated trees, and teams that push frequently to open
  PRs (per-push re-review compounds there).
- **Not worth it:** low-PR-volume repos, or a flat-rate reviewer where review count doesn't move the
  bill — there the only gain is less comment noise, not less spend.

## What it costs you

- **Quality risk is low, but real if you over-filter.** Excluding generated code is safe; excluding
  hand-written source under a broad glob (e.g. a `**/gen*/**` pattern that also catches `general/`) hides
  real changes from review. Keep path filters tight and reviewed.
- **Skipping per-push re-review** means a bug introduced late in a PR's life isn't re-flagged until you
  ask for a review — fine if your team triggers a review before merge, a gap if they rely on automatic
  re-review.
- **Setup effort is low:** a few lines of YAML (`.coderabbit.yaml`) or a repo/org policy toggle. The
  ongoing cost is remembering to prune the path filters as the repo grows.

## How to verify

- **Reviews per PR and per week** — the call count. Confirm drafts stopped triggering reviews and that a
  multi-push PR now produces one review, not one per push.
- **Metered reviewers:** watch the meter(s). On Copilot, track both AI Credits and, on private repos,
  Actions minutes attributed to the review workflow[^gh-cr-actions] — the two-meter change means a
  credits-only view understates the cost.
- **Flat-rate reviewers:** cost is fixed per active author, so verify on comment quality and review
  latency instead, and confirm you're only paying for authors who open PRs.

## Measured impact

_Not yet measured by us._ Benchmark: run a fixed set of PRs through a review bot twice on the same
repo — a baseline with default settings (drafts reviewed, per-push re-review, no path filters) vs the
variant applying this technique (drafts skipped, one review per PR, lockfiles/vendored/generated
excluded) — and compare number of review calls and input tokens per PR. Cited so far: GitHub's own docs
put Copilot code review at a **13× model multiplier** on legacy request-based billing[^gh-multipliers] and
add **Actions-minute** consumption per private-repo review from Jun 1 2026;[^gh-cr-actions] ⚠ both are
vendor billing terms, not an independent measurement, and the 13× figure applies only to the legacy plan.

[^gh-cr-actions]: GitHub Changelog, "GitHub Copilot code review will start consuming GitHub Actions minutes on June 1, 2026" — <https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/>
[^gh-multipliers]: GitHub Docs, "Model multipliers for annual plans on request-based billing (legacy)" — <https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/model-multipliers-for-annual-plans>
[^cr-auto-review]: CodeRabbit docs, "Auto review configuration" — <https://docs.coderabbit.ai/configuration/auto-review>
[^cr-path-filters]: CodeRabbit docs, "Path filters and path instructions" — <https://docs.coderabbit.ai/configuration/path-instructions>
