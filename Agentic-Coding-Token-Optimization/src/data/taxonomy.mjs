// =============================================================================
// TAXONOMY — static metadata for the Agentic-Coding-Token-Optimization site.
//
// Unlike Part 1, the *technique list* is NOT duplicated here — every technique
// already lives as a file in src/content/techniques/<group>/<slug>.md with its
// own group + level in frontmatter, so the content collection is the single
// source of truth. This file only holds the display metadata that the pages
// can't derive from a single entry: the 3 maturity LEVELS, the 5 GROUPS, and
// the FOUNDATIONS overview (setup, represented as a section — not technique pages).
// =============================================================================

/** @typedef {1|2|3} Level */

export const MATURITY_LEVELS = [
  {
    level: 1,
    name: 'Hygiene',
    tagline: 'Low-effort defaults',
    description:
      'Config-level wins almost every team should turn on: right-size the model, ' +
      'keep the rules file small, cache the prompt prefix, filter noisy tool output. ' +
      'Little risk, no measurement required to justify them.',
  },
  {
    level: 2,
    name: 'Engineering',
    tagline: 'Deliberate, measured setup',
    description:
      'Changes to how you run the agent — targeted context retrieval, subagents, ' +
      'plan-first workflows, orchestration — that need some setup and a quality bar, ' +
      'but use mostly off-the-shelf features of the tools you already have.',
  },
  {
    level: 3,
    name: 'Optimized',
    tagline: 'The cost/quality frontier',
    description:
      'Routing on live signals, gateway control planes, cache-aware agent design, ' +
      'shared self-hosted models, and eval-gated model swaps. More engineering, with ' +
      'strong payoff at scale.',
  },
];

export const GROUPS = [
  {
    slug: 'model-routing',
    label: 'Model Choice & Routing',
    short: 'Model Routing',
    blurb: 'Match each task to the cheapest model that can do it, and escalate only when it fails.',
  },
  {
    slug: 'context',
    label: 'Context Engineering',
    short: 'Context',
    blurb: 'Send the agent only what it needs, so you stop paying to re-read the repo every turn.',
  },
  {
    slug: 'caching',
    label: 'Caching',
    short: 'Caching',
    blurb: 'Reuse the prompt prefix across turns instead of paying full price for it each time.',
  },
  {
    slug: 'workflow',
    label: 'Workflow & Agent Loop',
    short: 'Workflow',
    blurb: 'Shape the agent loop so it stops burning turns and calls on the wrong work.',
  },
  {
    slug: 'quality',
    label: 'Quality & Evaluation',
    short: 'Quality',
    blurb: 'Measure cost per passing task so a cheaper setup is a safe swap, not a gamble.',
  },
];

// Foundations = one-time setup, not levers we benchmark. Shown as an overview
// section, not per-item technique pages (Daniel, 2026-08-10).
export const FOUNDATIONS = [
  {
    slug: 'measure-your-spend',
    title: 'Measure your spend',
    blurb:
      'You can’t optimize what you can’t see. Instrument tokens and cost per task, ' +
      'per model, and per session before changing anything — otherwise you can’t tell a ' +
      'win from noise.',
    points: [
      'Track cost per completed task (not per session) as the headline metric.',
      'Break spend down by model and by token type (input / output / cache read / cache write).',
      'Where to see it: `ccusage`, Claude Code OpenTelemetry metrics (`claude_code.cost.usage`), provider dashboards, Copilot AI-credit reports.',
    ],
  },
  {
    slug: 'understand-your-billing',
    title: 'Understand how you’re billed',
    blurb:
      'Every lever in this catalog moves one line on your bill. Knowing the price of input, ' +
      'output, cache reads and cache writes — and how your plan bills them — is what turns a ' +
      'technique into a number.',
    points: [
      'Per-model input/output pricing, plus cache-read (~0.1×) and cache-write (1.25–2×) multipliers and TTLs.',
      'Subscription vs API-credit billing changes cache TTL (1 hr vs 5 min) and what a technique is worth.',
      'Watch the moving prices: Sonnet 5’s intro rate steps up ($2/$10 → $3/$15, Sep 1 2026); Copilot moved to token-based AI Credits (Jun 1 2026); Anthropic dropped its >200k long-context surcharge (only Gemini still has the cliff).',
    ],
  },
];

export function groupBySlug(slug) {
  return GROUPS.find((g) => g.slug === slug);
}
export function levelByNumber(level) {
  return MATURITY_LEVELS.find((l) => l.level === level);
}
