import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One "source" = one citation in the structured bibliography.
// Inline citations in the body use GFM footnotes ([^id]); this structured list
// is the canonical, auditable reference set the layout renders as "References".
// `verify: true` marks a headline number that is practitioner/vendor-sourced (⚠).
const source = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string().optional(),
  authors: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  url: z.string().url().optional(),
  accessed: z.string().optional(), // ISO date the URL was last verified
  kind: z
    .enum(['docs', 'paper', 'blog', 'benchmark', 'talk', 'repo', 'pricing', 'other'])
    .default('other'),
  verify: z.boolean().optional(),
  note: z.string().optional(),
});

// Which token cost lever a technique pulls.
// 'model' appears on one page as a redundant alias of 'model-price' — allowed
// so the build stays green; clean up in content when convenient.
const costLever = z.enum([
  'input',
  'output',
  'calls',
  'turns',
  'cache',
  'model-price',
  'plan',
  'model',
]);

// Tools/frameworks a technique applies to. Keys map to TOOL_MATRIX.md columns
// for coding harnesses; the Quality group also uses eval-framework and
// benchmark keys (evals aren't harness-specific). Curated so a typo fails the
// build while the known framework/benchmark keys are accepted.
const appliesToKey = z.enum([
  // coding harnesses
  'claude-code',
  'cursor',
  'cline',
  'aider',
  'copilot',
  'codex',
  'opencode',
  'grok-build',
  'gemini-cli',
  'goose',
  'openhands',
  // eval frameworks
  'langfuse',
  'braintrust',
  'harbor',
  'hal',
  // benchmarks
  'swe-bench',
  'swe-bench-verified',
  'swe-bench-live',
  'swe-bench-pro',
  'swe-bench-harness',
  'aider-polyglot',
  'livecodebench',
  'mini-swe-agent',
  'terminal-bench',
]);

const techniques = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/techniques' }),
  schema: z.object({
    title: z.string(),
    group: z.enum(['model-routing', 'context', 'caching', 'workflow', 'quality']),

    // Pyramid tier: 1 Hygiene / 2 Engineering / 3 Optimized.
    level: z.number().int().min(1).max(3),

    // Scorecard.
    costLever: z.array(costLever).default([]),
    effort: z.enum(['Low', 'Medium', 'High']),
    savingEstimate: z.string(), // short free text ("large", "~30–50%", "varies")
    savingBasis: z.enum(['measured', 'cited', 'estimate']), // measured = our benchmark
    qualityRisk: z.enum(['Low', 'Medium', 'High']),

    appliesTo: z.array(appliesToKey).default([]),

    // Research-workflow metadata.
    status: z
      .enum(['planned', 'in-progress', 'researched', 'published'])
      .default('planned'),
    lastUpdated: z.string().optional(),

    // Optional cross-links to related technique ids ("<group>/<slug>").
    related: z.array(z.string()).default([]),

    // Structured bibliography.
    sources: z.array(source).default([]),
  }),
});

export const collections = { techniques };
