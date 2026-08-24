---
title: "Public leaderboards for shortlisting"
group: quality
level: 1
costLever: [model-price]
effort: Low
savingEstimate: "enables cheap-model selection; no direct token cut"
savingBasis: cited
qualityRisk: Medium
appliesTo:
  - swe-bench-verified
  - aider-polyglot
  - swe-bench-pro
  - swe-bench-live
  - terminal-bench
  - livecodebench
status: researched
lastUpdated: "2026-08-10"
related:
  - "model-routing/open-cheap-model-substitution"
  - "model-routing/task-class-model-tier-map"
sources:
  - id: swebench-verified
    title: "SWE-bench Verified leaderboard (mini-SWE-agent bash-only board, $/instance)"
    publisher: "SWE-bench"
    url: "https://www.swebench.com/verified.html"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Bash-only board evaluates all LMs with mini-SWE-agent (minimal ReAct loop, no scaffold) and publishes $/instance next to resolved-%. Open-weight MiniMax M2.5 75.8% @ $0.073 vs Claude 4.5 Opus 76.8% @ $0.754. Cost data only for mini-SWE-agent runs — never compare $/instance across harnesses."
  - id: aider-leaderboard
    title: "Aider polyglot leaderboard"
    publisher: "Aider"
    url: "https://aider.chat/docs/leaderboards/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "225 Exercism exercises across 6 languages (C++, Go, Java, JS, Python, Rust). Reports percent-correct, total Cost per run, and correct-edit-format % per model."
  - id: swebench-pro
    title: "SWE-bench Pro leaderboard (public / held-out / commercial)"
    publisher: "Scale AI"
    url: "https://labs.scale.com/leaderboard/swe_bench_pro_commercial"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Three-tier design for contamination resistance: 731 public (copyleft/GPL) instances, 858 held-out private instances, 276 commercial instances from 18 private startup codebases. Held-out and commercial sets are not public, so they resist training-data leakage."
  - id: swebench-live
    title: "SWE-bench-Live leaderboard"
    publisher: "SWE-bench-Live"
    url: "https://swe-bench-live.github.io/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Auto-updating benchmark; ~50 newly verified post-2024 GitHub issues added monthly via an automated curation pipeline, so recent test instances post-date model training cutoffs."
  - id: terminal-bench
    title: "Terminal-Bench leaderboard"
    publisher: "Laude Institute / Harbor"
    url: "https://www.tbench.ai/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Harbor-native benchmark for terminal tasks (build kernels, configure servers, ML training). Harbor ships installed-agent adapters so real coding harnesses run directly as the agent."
  - id: terminal-bench-agents
    title: "terminal-bench installed_agents (adapter directory)"
    publisher: "harbor-framework/terminal-bench-1"
    url: "https://github.com/harbor-framework/terminal-bench-1/tree/main/terminal_bench/agents/installed_agents"
    accessed: "2026-08-10"
    kind: repo
    note: "Adapter dir contains aider, claude_code, codex, cursor_cli, gemini_cli, goose, grok_cli, mini_swe_agent, opencode, openhands, qwen_code. Harbor docs additionally list copilot-cli and cline-cli."
  - id: livecodebench
    title: "LiveCodeBench: holistic and contamination-free evaluation for code"
    publisher: "LiveCodeBench"
    url: "https://livecodebench.github.io/"
    accessed: "2026-08-10"
    kind: benchmark
    note: "Competitive-programming problems (LeetCode/AtCoder/Codeforces) tagged with release dates; evaluate only on problems released after a model's cutoff to avoid contamination. Release windows v1–v6 (400→1055 problems)."
  - id: metr-study
    title: "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity"
    publisher: "METR"
    url: "https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/"
    accessed: "2026-08-10"
    kind: paper
    note: "RCT: experienced devs 19% slower with AI despite impressive benchmark scores; authors note benchmarks 'only measure performance on well-scoped, algorithmically scorable tasks.' Use as the benchmark-vs-real-work caveat, not a mergeability claim."
---

## What & why

A public leaderboard is a fast, free way to **shortlist** which models to put through your own
evaluation — not a substitute for it. Some boards now publish cost next to accuracy: the SWE-bench
Verified bash-only board runs every model through the same minimal `mini-SWE-agent` harness and shows
**$/instance** alongside resolved-%,[^swebench-verified] and the Aider polyglot board shows **total
cost per run**.[^aider-leaderboard] That lets you spot, in minutes, which cheaper models sit within a
point or two of the frontier at a fraction of the per-task cost — the input to the cheap-model-selection
decision. The token lever is indirect: the board doesn't cut tokens, it tells you which model to test
so you can cut model price without a blind gamble.

## How to do it

The method is a two-stage screen: **read the board to narrow the field, then prove the winner on your
own repo.** The boards divide into two jobs.

1. **Screen on cost-aware boards.** Use the ones that publish spend so you can rank by cost, not just
   accuracy:
   - **SWE-bench Verified — bash-only board.** All models run through the fixed `mini-SWE-agent` scaffold
     (a plain ReAct loop, no tools), so the harness is held constant and the published **$/instance** is
     comparable *within that board*.[^swebench-verified]
   - **Aider polyglot.** 225 Exercism exercises in six languages, with **total cost** and **correct-edit-format
     %** per model — the edit-format column is a useful early signal of whether a model can actually drive a
     diff-based harness.[^aider-leaderboard]

2. **Cross-check on contamination-resistant boards.** A model can score high because the tasks leaked into
   its training data. Boards built to resist that:
   - **SWE-bench Pro** keeps **held-out** and **commercial** sets private (copyleft public repos plus 18 real
     startup codebases), so those splits can't easily be trained on.[^swebench-pro]
   - **SWE-bench-Live** adds ~50 fresh, verified GitHub issues **every month**, post-dating training
     cutoffs.[^swebench-live]
   - **LiveCodeBench** tags every problem with a **release date** so you can score a model only on problems
     published after its cutoff.[^livecodebench]
   - **Terminal-Bench** covers real terminal work (builds, server config, ML training) rather than issue-fixing
     alone.[^terminal-bench]

3. **Then run your own eval.** Take the two or three models the boards surfaced and run them on your golden
   task set, holding the harness fixed, and compare **cost per passing task** — the number the board can't give
   you because your repo, prompts, and edit format aren't its. Pair this page with the eval-gated cheap-model
   swap.

**Where the harness itself plugs in:** Terminal-Bench runs on **Harbor**, which ships installed-agent adapters
so a real coding tool runs *as the benchmarked agent* rather than a bare model. The adapter directory includes
`claude_code`, `codex`, `cursor_cli`, `aider`, `opencode`, `grok_cli`, `gemini_cli`, `goose`, `openhands`, and
`qwen_code` (Harbor docs also list `copilot-cli` and `cline-cli`).[^terminal-bench-agents] That means you can
benchmark the actual harness-plus-model combination you'd ship, not just the model in isolation. For observability
during your own eval runs (not the public board), Langfuse can trace Claude Code, Codex, and Copilot. See this
technique's row in `TOOL_MATRIX.md`.

## When it's worth it / when not

- **Worth it:** at the top of a model-selection or cheap-substitution decision, to cut the candidate list from
  dozens to a handful before you spend eval budget. Free and fast.
- **Worth it:** when a cost-aware board (SWE-bench Verified bash-only, Aider polyglot) lets you rank by price and
  the edit-format column filters out models that can't drive a diff harness.
- **Not worth it as a decision by itself.** A leaderboard number is not a purchase order. Contamination and
  harness/scaffold differences move scores by **10–20 points**, so a board "win" may not survive on your code.
- **Not worth it for cross-harness cost math.** $/instance is only comparable *within one harness*
  (`mini-SWE-agent`); comparing cost across boards or harnesses is meaningless.[^swebench-verified]

## What it costs you

- **The main risk is trusting the number.** Benchmarks measure "well-scoped, algorithmically scorable tasks,"
  which is not the same as your production work — the METR RCT found experienced developers 19% *slower* with AI
  tools that post strong benchmark scores.[^metr-study] Use boards to screen, never to conclude.
- **Contamination inflates old boards.** If tasks predate a model's training cutoff, the score may reflect
  memorization. Prefer the held-out / date-filtered boards for the cross-check.[^swebench-pro][^swebench-live][^livecodebench]
- **Scaffold sensitivity.** The same model scores differently under different harnesses; a board using a richer
  scaffold than yours will over-predict what you'll get. The bash-only board deliberately strips the scaffold to
  reduce this, at the cost of realism.[^swebench-verified]
- **Setup effort is Low** — reading a board is free; the cost is the follow-up eval, which is the real work and
  lives on its own page.

## How to verify

- **Did the board actually narrow your field?** The output of this step is a shortlist of 2–3 models, plus the
  board's $/instance or cost-per-run as a *rough* price prior — nothing more.
- **Does the shortlist hold on your repo?** Run your golden set and compare **cost per passing task** against the
  board's ranking. A large gap between board rank and your rank is the contamination/scaffold warning firing.
- **Re-read the boards on a schedule.** Leaderboard numbers churn as models and harness versions change; treat any
  figure as a dated snapshot and re-check quarterly.

## Measured impact

_This technique buys screening speed, not a token cut, so there is no before/after arm._ Its value is that it
makes the cheap-model-substitution decision cheaper to reach: on the SWE-bench Verified `mini-SWE-agent` board,
open-weight **MiniMax M2.5 resolves 75.8% at $0.073/instance versus Claude 4.5 Opus 76.8% at $0.754** — about one
point lower at roughly a tenth of the per-task cost, which is exactly the kind of candidate a board surfaces for
you to then eval.[^swebench-verified] The honest measure of this step is **selection quality**: whether the model
the board shortlisted survives your own golden-task eval (arm R2 — open/cheap-model substitution). ⚠ Leaderboard
figures are dated snapshots; contamination and harness/scaffold differences can swing scores 10–20 points, and
cost is comparable only within a single harness.

[^swebench-verified]: SWE-bench, "Verified leaderboard (mini-SWE-agent bash-only board, $/instance)" — <https://www.swebench.com/verified.html>
[^aider-leaderboard]: Aider, "Polyglot leaderboard" — <https://aider.chat/docs/leaderboards/>
[^swebench-pro]: Scale AI, "SWE-bench Pro leaderboard (commercial dataset)" — <https://labs.scale.com/leaderboard/swe_bench_pro_commercial>
[^swebench-live]: SWE-bench-Live leaderboard — <https://swe-bench-live.github.io/>
[^terminal-bench]: Laude Institute / Harbor, "Terminal-Bench" — <https://www.tbench.ai/>
[^terminal-bench-agents]: harbor-framework/terminal-bench-1, "installed_agents adapter directory" — <https://github.com/harbor-framework/terminal-bench-1/tree/main/terminal_bench/agents/installed_agents>
[^livecodebench]: LiveCodeBench, "Holistic and contamination-free evaluation for code" — <https://livecodebench.github.io/>
[^metr-study]: METR, "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity" — <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>
