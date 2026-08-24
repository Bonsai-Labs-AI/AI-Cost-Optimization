---
title: "Best-of-N / parallel exploration tradeoff"
group: workflow
level: 3
costLever: [calls, output]
effort: Low
savingEstimate: "N× the cost — a spend multiplier to ration, not a saving"
savingBasis: cited
qualityRisk: Low
appliesTo:
  - claude-code
  - cursor
  - codex
  - cline
  - aider
  - copilot
  - opencode
status: researched
lastUpdated: "2026-08-10"
related:
  - "workflow/plan-spec-before-code"
  - "workflow/loop-guardrails"
  - "model-routing/task-class-model-tier-map"
sources:
  - id: excomm
    title: "ExComm: Exploration-Stage Communication for Error-Resilient Agentic Test-Time Scaling"
    publisher: "Song et al. (Together AI, Amazon AGI, KAIST), arXiv:2605.22102"
    url: "https://arxiv.org/abs/2605.22102"
    accessed: "2026-08-10"
    kind: paper
    verify: true
    note: "ExComm at N=4 outperforms all N=8 baselines on AIME and GAIA at lower API cost, modest added latency (10.45 vs 9.57 min). General reasoning (AIME/GAIA), not a coding-agent benchmark — directional for coding."
  - id: cc-agents
    title: "Run agents in parallel"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/agents"
    accessed: "2026-08-10"
    kind: docs
    note: "Subagents, agent view, agent teams, dynamic workflows; worktrees isolate parallel sessions; /batch splits into 5–30 worktree subagents. 'Running several sessions or subagents at once multiplies token usage.'"
  - id: cursor-worktrees
    title: "Worktrees"
    publisher: "Cursor docs"
    url: "https://cursor.com/docs/configuration/worktrees"
    accessed: "2026-08-10"
    kind: docs
    note: "/best-of-n runs the same task across multiple models at once, each in its own worktree; you pick the winner; /apply-worktree merges it back."
  - id: codex-cloud-attempts
    title: "Codex Cloud vs Codex Local: When to Run in the Cloud"
    publisher: "Codex Knowledge Base (Daniel Vaughan)"
    url: "https://codex.danielvaughan.com/2026/03/27/codex-cloud-vs-local-when-to-run-in-cloud/"
    accessed: "2026-08-10"
    kind: blog
    verify: true
    note: "codex cloud exec --attempts N (recommended 2–4) runs multiple independent attempts and surfaces the strongest; each attempt consumes credits independently."
  - id: cc-costs
    title: "Manage costs (agent teams token multiple)"
    publisher: "Claude Code docs"
    url: "https://code.claude.com/docs/en/costs"
    accessed: "2026-08-10"
    kind: docs
    verify: true
    note: "Agent teams use ~7× the tokens of a standard session in plan mode (each teammate = its own context window). Vendor self-reported."
---

## What & why

Best-of-N runs the same task several times in parallel — N independent trajectories — and keeps the best
result. It trades tokens for a better chance of a good answer on a hard task. The lever it pulls is the
number of parallel runs (calls, and the output tokens each generates): cost scales roughly **linearly with
N**, so N=4 costs about 4× a single run, N=8 about 8×.[^cc-agents] That makes it the opposite of a saving —
it's a spend multiplier you ration to the few tasks where a better first answer is worth several runs.

Two facts keep it from being a blunt "always run 8" setting. First, N buys less as it grows — the jump from
1 to 2 or 4 helps most, and each further doubling adds less. Second, spending the same budget on *targeted
coordination* between runs can beat spending it on more runs: one 2026 study finds that letting exploring
agents share findings mid-run (ExComm) matches or beats an N=8 baseline while using only **N=4** solver
agents, at lower API cost.[^excomm] So the question isn't only "how many," it's "how many, and do they talk."

## How to do it

1. **Decide it's a best-of-N task at all.** Reserve it for genuinely hard, high-value, ambiguous work where
   a single run often misses — a tricky refactor with several valid approaches, a flaky bug, an algorithm
   with a real chance of a wrong first attempt. For routine edits, one run plus a retry is cheaper and just
   as good.
2. **Pick a small N.** Start at N=2–4. Because returns diminish and cost is linear, N=8 rarely pays for
   itself over N=4 on coding tasks. Let the task's difficulty, not habit, set N.
3. **Isolate the runs.** Give each trajectory its own git worktree so parallel agents don't edit the same
   files; then compare the candidates and keep one. This is the shape of every tool's mechanism — the
   difference is whether the tool has a single command for it (Cursor's `/best-of-n`,[^cursor-worktrees]
   Codex Cloud's `--attempts`[^codex-cloud-attempts]) or you script worktrees by hand. See this technique's
   row in `TOOL_MATRIX.md`.
4. **Judge and keep one.** Best-of-N is only as good as the selection step: pick by running the tests, a
   diff review, or a cheap judging pass — not by eyeballing. Discard the losers; don't pay to keep them
   warm.
5. **Prefer coordination to brute N where the tool allows it.** If exploring runs can exchange partial
   findings, a smaller N reaches the same quality — the ExComm result.[^excomm] This is still research-stage
   in off-the-shelf tools; treat it as the direction, and for now get most of the benefit by keeping N
   small and the selection step honest.

## When it's worth it / when not

- **Worth it:** hard, high-value, one-shot-matters tasks — a complex refactor with multiple valid designs, a
  stubborn bug, anything where a wrong first answer is expensive to unwind. Here paying 3–4× for a good
  answer beats paying once for a bad one and re-doing it.
- **Worth it:** when you have a cheap, reliable way to pick the winner (a test suite, a lint/build gate) so
  the extra runs actually convert into a better kept result.
- **Not:** routine or well-specified tasks. If one run usually succeeds, N runs just multiply the bill; a
  single run plus fail-fast and a retry is cheaper.
- **Not as a fix for a vague task.** N copies of an under-specified prompt give you N variations of the
  wrong thing. Spend the effort on the spec first (see `workflow/plan-spec-before-code`); best-of-N amplifies
  a good prompt, it doesn't rescue a bad one.
- **Not at large N.** Diminishing returns plus linear cost mean N=8+ is almost never the economical choice
  over N=4 for coding.

## What it costs you

- **A near-linear cost multiplier.** N parallel runs cost ~N× the tokens of one; run-many-agents features
  carry the same multiplier (Claude Code notes several sessions/subagents at once "multiplies token
  usage,"[^cc-agents] and agent teams run ~7× a standard session ⚠[^cc-costs]). This is the whole cost of the
  technique, and why it's rationed.
- **A selection burden.** You now have N candidates to judge. Without a cheap automatic gate (tests, build),
  the human review time can cost more than the tokens, and a bad pick wastes the whole run.
- **Wasted losers.** Every discarded trajectory is fully paid for. That's expected — but it means best-of-N
  only makes sense when the *kept* result is worth the N−1 you threw away.
- **Low quality risk.** It doesn't degrade quality — worst case it's the quality of one run at N× the price.
  The risk is purely economic: over-using it, or setting N too high.

## How to verify

- **Confirm the multiplier is bounded.** Track tokens (or cost) per completed task on best-of-N tasks vs
  single-run tasks; it should sit near N×, not more. If it's climbing above N×, runs aren't being isolated
  or losers aren't being discarded.
- **Confirm it's rationed.** Count what fraction of tasks use best-of-N and at what N. If it's creeping onto
  routine work, or N is drifting up to 8, that's spend with little return.
- **Confirm the payoff.** Compare pass rate (or accepted-PR rate) on hard tasks with best-of-N vs a single
  run. If N runs don't lift the success rate on the tasks you reserve it for, stop paying for them.
- Per-session token attribution — Claude Code `/usage`, `ccusage`, or gateway logs — shows the parallel-run
  cost so you can see the multiplier directly.

## Measured impact

_Not yet measured by us._ Benchmark: take a set of hard, ambiguous coding tasks and run each three ways on
the same repo and model — a single run (baseline), best-of-4, and best-of-8 — selecting the winner by the
same test gate each time, then compare **pass rate against total tokens per solved task**. The expected shape
is a rising-then-flattening curve: N=2–4 lifts the pass rate at ~2–4× cost, N=8 adds little over N=4 at
double the price. Published anchor (general reasoning, not coding): ExComm reports that targeted
exploration-stage communication matches or beats an N=8 baseline using only N=4 solver agents at lower API
cost. ⚠ That is a research paper on AIME/GAIA reasoning tasks, not an independent coding-agent measurement —
directional for coding until D3 confirms it on real repos.[^excomm]

[^excomm]: Song et al. (Together AI, Amazon AGI, KAIST), "ExComm: Exploration-Stage Communication for Error-Resilient Agentic Test-Time Scaling," arXiv:2605.22102 — <https://arxiv.org/abs/2605.22102>
[^cc-agents]: Claude Code docs, "Run agents in parallel" — <https://code.claude.com/docs/en/agents>
[^cursor-worktrees]: Cursor docs, "Worktrees" (`/best-of-n`) — <https://cursor.com/docs/configuration/worktrees>
[^codex-cloud-attempts]: Codex Knowledge Base, "Codex Cloud vs Codex Local" (`codex cloud exec --attempts N`) — <https://codex.danielvaughan.com/2026/03/27/codex-cloud-vs-local-when-to-run-in-cloud/>
[^cc-costs]: Claude Code docs, "Manage costs" — <https://code.claude.com/docs/en/costs>
