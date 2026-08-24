# Token Cost Optimization for Agentic Coding — summary

Bonsai Labs research, part 2 (after "Cost Optimization for AI Products"). Draft for review — Daniel, 2026-08-10.

## The problem

Teams that code with AI agents — Claude Code, Cursor, GitHub Copilot, Cline, Aider, and similar — are
seeing token spend rise fast. At the companies we work with it's growing about 40% month over month, and
the output hasn't grown to match. CTOs want two things: a way to see where the spend goes, and a set of
changes that lower the bill without hurting code quality. We also want to be able to go in and set this up
directly in a team's tools and repos.

## What we're producing

1. A short framework a CTO can act on.
2. A set of techniques, each written up with sources.
3. A benchmark report with our own numbers, comparing setups on both cost and quality.

The benchmark is what makes this more than a summary of what's already online: the recommendations are
backed by tests we ran, not just cited from elsewhere.

## How it's organized

Two layers.

**Foundations — the setup you do once.**
- Measure and attribute spend (per developer, team, repo, and task).
- Pick the right plan and billing model (subscription vs API, credits, caching discounts).

These aren't really techniques; they're the starting point. You can't cut what you can't see, and often the
quickest saving is just choosing the right plan.

**Techniques — the repeatable changes.** Five groups:
1. **Model choice and routing** — use a cheaper model for simple work, keep the expensive one for hard work.
2. **Context engineering** — control what the agent reads.
3. **Caching** — keep the prompt cache working so you don't re-pay for the same context every turn.
4. **Workflow** — plan before coding, scope tasks, stop runaway loops, avoid rework.
5. **Quality and evaluation** — check that a cost cut didn't lower code quality.

## Where we are

We ran a research pass and compiled a candidate list of about 75 techniques (in `CANDIDATE_TECHNIQUES.md`).
The next step is to cut it down to 30–35 with Rony.

## The benchmark

Take a few real tasks on a large repo. Run each one through different setups: plain, then with a good rules
file, then with a code index, then with a cheaper model, and so on. Measure cost and quality together. The
main number is cost per task that actually passes its tests, not raw tokens — a cheaper run that fails isn't
cheaper.

## Timeline and what we need

About two weeks, aiming to finish around August 22–24 for a September launch.
- **Rony:** review and cut the technique list, and sanity-check it against your day-to-day work.
- **Csongor:** budget for the benchmark (we'll run a small pilot first, then come back with a real number),
  and access to an open-model provider.

More detail is in `PLAN.md`. The research and its sources are in `RESEARCH_FINDINGS.md`. The full technique
list is in `CANDIDATE_TECHNIQUES.md`.
