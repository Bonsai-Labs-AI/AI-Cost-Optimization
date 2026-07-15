import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One "source" = one citation in the structured bibliography.
// Inline citations in the body use GFM footnotes ([^id]); this structured list
// is the canonical, auditable reference set the layout renders as "References".
const source = z.object({
  id: z.string(), // short key, e.g. "anthropic-prompt-caching"
  title: z.string(),
  publisher: z.string().optional(), // org / site / journal
  authors: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  url: z.string().url().optional(),
  accessed: z.string().optional(), // ISO date the URL was last verified
  kind: z
    .enum(['docs', 'paper', 'blog', 'benchmark', 'talk', 'repo', 'pricing', 'other'])
    .default('other'),
  note: z.string().optional(),
});

const techniques = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/techniques' }),
  schema: z.object({
    title: z.string(),
    category: z.enum([
      'model-routing',
      'prompt-context',
      'caching-reuse',
      'batching-async',
      'rag',
      'output',
      'fine-tuning',
      'agent-workflow',
      'product-ux',
    ]),
    // Pyramid tier. Provisional until research confirms it.
    maturityLevel: z.number().int().min(1).max(3),
    maturityProvisional: z.boolean().default(true),

    shortDescription: z.string(),

    // Scorecard. Optional so stubs validate before research is done.
    effort: z.enum(['Low', 'Medium', 'High']).optional(),
    gain: z.enum(['Low', 'Medium', 'High', 'Very High']).optional(),
    riskToQuality: z.enum(['Low', 'Medium', 'High']).optional(),

    // One-sentence rationale for each scorecard value — shown in a hover popover.
    effortWhy: z.string().optional(),
    gainWhy: z.string().optional(),
    riskWhy: z.string().optional(),

    // Quick-scan lists (also useful for future filtering/search).
    detectionSignals: z.array(z.string()).default([]),
    measurementMethods: z.array(z.string()).default([]),

    // Research-workflow metadata.
    status: z.enum(['planned', 'in-progress', 'researched', 'published']).default('planned'),
    lastUpdated: z.string().optional(),

    // Structured bibliography.
    sources: z.array(source).default([]),

    // Optional cross-links to related technique ids (category/slug).
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { techniques };
