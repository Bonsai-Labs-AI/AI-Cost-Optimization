// =============================================================================
// TAXONOMY — single source of truth for the research site.
// Imported by both Astro (build) and scripts/generate-stubs.mjs (Node).
//
// - MATURITY_LEVELS: the 5 tiers of the pyramid (0..4).
// - CATEGORIES: the 10 thematic groupings (used as filters/tags).
// - TECHNIQUES_BY_CATEGORY: every technique, with its category, slug, and
//   maturity level. Levels were confirmed in the fine-grained review (see
//   docs/DECISIONS.md and docs/TECHNIQUE_REVIEW.md); most are no longer
//   provisional. New stubs default to maturityProvisional: true.
//
// `effort`, `gain`, and `riskToQuality` are research outputs and live in each
// technique's markdown frontmatter, not here.
// =============================================================================

/** @typedef {0|1|2|3|4} Level */

export const MATURITY_LEVELS = [
  {
    level: 0,
    name: 'Not Optimized',
    tagline: 'Obvious waste exists',
    description:
      'No deliberate cost work. Default models, bloated prompts, no measurement. ' +
      'Techniques here remove blatant waste and establish basic hygiene.',
  },
  {
    level: 1,
    name: 'Basic Optimization',
    tagline: 'Low-effort, high-confidence wins',
    description:
      'The easy wins almost every product should adopt: right-sizing, exact and ' +
      'prefix caching, output limits, structured outputs, basic guardrails.',
  },
  {
    level: 2,
    name: 'Advanced Optimization',
    tagline: 'Deliberate, measured engineering',
    description:
      'Systematic context/RAG/agent engineering backed by evaluation. Requires ' +
      'real measurement and a quality bar, but uses mostly off-the-shelf tooling.',
  },
  {
    level: 3,
    name: 'Highly Optimized',
    tagline: 'Custom systems and specialized models',
    description:
      'Dynamic routing, semantic caching, fine-tuned task models, compression ' +
      'pipelines. Meaningful engineering investment with strong ROI at scale.',
  },
  {
    level: 4,
    name: 'Near-Frontier / Adaptive',
    tagline: 'Continuously self-optimizing',
    description:
      'Router-training flywheels, self-hosted fine-tuned models, calibrated ' +
      'quantization/QAT, graph retrieval. The frontier of cost/quality.',
  },
];

export const CATEGORIES = [
  {
    slug: 'visibility-measurement',
    label: 'Visibility & Measurement',
    short: 'Visibility',
    blurb: 'You cannot optimize what you cannot see. Observability, attribution, evals, guardrails.',
  },
  {
    slug: 'model-routing',
    label: 'Model Choice & Routing',
    short: 'Model Routing',
    blurb: 'Send each request to the cheapest model that can do the job well enough.',
  },
  {
    slug: 'prompt-context',
    label: 'Prompt & Context Optimization',
    short: 'Prompt & Context',
    blurb: 'Spend fewer input tokens per call without losing the information the model needs.',
  },
  {
    slug: 'caching-reuse',
    label: 'Caching & Reuse',
    short: 'Caching',
    blurb: 'Never pay twice for the same (or similar) computation.',
  },
  {
    slug: 'batching-async',
    label: 'Batching & Async Processing',
    short: 'Batching & Async',
    blurb: 'Trade latency for cost by deferring, queueing, and batching non-urgent work.',
  },
  {
    slug: 'rag',
    label: 'RAG-Specific Optimization',
    short: 'RAG',
    blurb: 'Retrieve less, retrieve better — cut context bloat in retrieval pipelines.',
  },
  {
    slug: 'output',
    label: 'Output Optimization',
    short: 'Output',
    blurb: 'Generate fewer, cheaper, more deterministic output tokens.',
  },
  {
    slug: 'fine-tuning',
    label: 'Fine-Tuning, Distillation & Specialized Models',
    short: 'Fine-Tuning',
    blurb: 'Replace a big general model with a small specialized one you own.',
  },
  {
    slug: 'agent-workflow',
    label: 'Agent & Workflow Optimization',
    short: 'Agents',
    blurb: 'Bound, decompose, and compress agentic loops so they stop burning tokens.',
  },
  {
    slug: 'product-ux',
    label: 'Product & UX-Level Optimization',
    short: 'Product & UX',
    blurb: 'Shape product and UX so users pull expensive AI only when it is worth it.',
  },
];

// Helper to keep the technique list compact: [slug, title, level]
const t = (slug, title, level) => ({ slug, title, level });

// TECHNIQUES grouped by category slug. Levels confirmed in the review.
export const TECHNIQUES_BY_CATEGORY = {
  'visibility-measurement': [
    t('token-cost-observability', 'Token & Cost Observability', 0),
    t('cost-dashboards', 'Cost Dashboards', 0),
    t('tag-based-cost-attribution', 'Tag-Based Cost Attribution', 1),
    t('budget-limits-guardrails', 'Budget Limits & Guardrails', 1),
    t('quality-cost-evaluation-suite', 'Quality–Cost Evaluation Suite', 2),
    t('cost-regression-tests', 'Cost Regression Tests', 2),
    t('cost-anomaly-detection', 'Cost Anomaly Detection', 2),
    t('cache-hit-rate-instrumentation', 'Cache-Hit-Rate Instrumentation', 2),
    t('unit-economics-cost-per-outcome', 'Unit Economics: Cost per Outcome', 3),
  ],
  'model-routing': [
    t('model-right-sizing', 'Model Right-Sizing', 1),
    t('provider-routing', 'Provider Routing', 2),
    t('fallback-routing', 'Fallback Routing', 2),
    t('reasoning-token-budgeting', 'Reasoning / Thinking-Token Budgeting', 2),
    t('dynamic-model-routing', 'Dynamic Model Routing', 3),
    t('llm-cascades', 'LLM Cascades', 3),
    t('local-open-weight-substitution', 'Local / Open-Weight Model Substitution', 3),
    t('router-training-from-traffic', 'Router Training From Production Traffic', 4),
  ],
  'prompt-context': [
    t('prompt-cleanup', 'Prompt Cleanup', 0),
    t('prompt-modularization', 'Prompt Modularization', 1),
    t('long-context-avoidance', 'Long-Context Avoidance', 1),
    t('few-shot-example-pruning', 'Few-Shot Example Pruning', 2),
    t('structured-context-packing', 'Structured Context Packing', 2),
    t('context-window-budgeting', 'Context Window Budgeting', 2),
    t('provider-native-context-management', 'Provider-Native Context Management', 2),
    t('learned-prompt-compression', 'Learned Prompt Compression (LLMLingua)', 3),
    t('conversation-summarization', 'Conversation Summarization', 3),
    t('context-pruning', 'Context Pruning', 3),
    t('context-offloading', 'Context Offloading / Filesystem-as-Memory', 3),
    t('dynamic-few-shot-selection', 'Dynamic Few-Shot Selection', 3),
    t('automated-prompt-optimization', 'Automated Prompt Optimization (DSPy / GEPA)', 4),
  ],
  'caching-reuse': [
    t('prompt-caching-prefix-caching', 'Prompt Caching / Prefix Caching', 1),
    t('exact-response-caching', 'Exact Response Caching', 2),
    t('embedding-caching', 'Embedding Caching', 2),
    t('summary-caching', 'Summary Caching', 2),
    t('semantic-caching', 'Semantic Caching', 3),
    t('retrieval-result-caching', 'Retrieval Result Caching', 3),
    t('tool-result-caching', 'Tool Result Caching', 3),
    t('cache-aware-agent-design', 'Cache-Aware Agent Design', 3),
    t('cache-invalidation-strategies', 'Cache Invalidation Strategies', 3),
  ],
  'batching-async': [
    t('batch-api-usage', 'Batch API Usage', 1),
    t('bulk-extraction-classification', 'Bulk Extraction / Classification Pipelines', 2),
    t('latency-tiered-processing', 'Latency-Tiered Processing', 3),
    t('pre-generation', 'Pre-Generation (Infra)', 3),
  ],
  rag: [
    t('metadata-filtering', 'Metadata Filtering Before Vector Search', 1),
    t('reducing-retrieved-chunk-count', 'Reducing Retrieved Chunk Count', 1),
    t('chunking-parameter-tuning', 'Chunking-Parameter Tuning', 2),
    t('reranking-before-generation', 'Reranking Before Generation', 2),
    t('retrieval-chunk-deduplication', 'Retrieval-Time Chunk Deduplication', 2),
    t('hierarchical-retrieval', 'Hierarchical Retrieval', 3),
    t('precomputed-document-summaries', 'Precomputed Document Summaries', 3),
    t('embedding-quantization-mrl', 'Embedding Quantization & MRL Truncation', 3),
    t('contextual-compression', 'Contextual Compression', 4),
    t('graphrag-vs-vector-tradeoff', 'GraphRAG vs Vector Tradeoff', 4),
  ],
  output: [
    t('output-length-control', 'Output Length Control', 0),
    t('structured-outputs', 'Structured Outputs', 1),
    t('max-token-policies', 'Max-Token Policies by Task Type', 1),
    t('verbosity-controls', 'Verbosity Controls', 1),
    t('streaming-with-early-stop', 'Streaming With Early Stop', 2),
    t('template-plus-fill', 'Template-Plus-Fill Generation', 2),
    t('post-processing-instead-of-generation', 'Post-Processing Instead of Generation', 2),
    t('constrained-decoding', 'Constrained Decoding / Grammars', 3),
  ],
  'fine-tuning': [
    t('fine-tuning-cheaper-models', 'Fine-Tuning Cheaper Models', 3),
    t('task-specific-classifiers', 'Task-Specific Classifiers', 3),
    t('task-specific-extractors', 'Task-Specific Extractors', 3),
    t('specialized-embedding-models', 'Specialized Embedding Models', 3),
    t('local-model-deployment', 'Local Model Deployment', 4),
    t('calibrated-quantization', 'Calibrated Quantization (GPTQ / AWQ / QAT)', 4),
    t('multi-lora-serving', 'Multi-LoRA Serving', 4),
  ],
  'agent-workflow': [
    t('agent-budget-guardrails', 'Agent Budget Guardrails', 1),
    t('tool-use-minimization', 'Tool-Use Minimization', 2),
    t('human-in-the-loop-checkpoints', 'Human-in-the-Loop Checkpoints', 2),
    t('state-compression-for-agents', 'State Compression for Agents', 3),
    t('reusable-memory-artifact-store', 'Reusable Memory / Artifact Store', 3),
    t('workflow-decomposition', 'Workflow Decomposition', 3),
    t('programmatic-tool-calling', 'Programmatic Tool Calling (Code Execution with MCP)', 4),
    t('specialized-sub-agents', 'Specialized Sub-Agents', 4),
  ],
  'product-ux': [
    t('ai-feature-gating', 'AI Feature Gating', 1),
    t('user-controlled-quality-mode', 'User-Controlled Quality Mode', 2),
    t('ai-non-ai-hybrid-ux', 'AI / Non-AI Hybrid UX', 2),
    t('precomputed-content-surfacing', 'Precomputed Content Surfacing', 2),
    t('agent-scope-confirmation', 'Agent Scope / Plan Confirmation', 2),
    t('cost-aware-product-tiers', 'Cost-Aware Product Tiers', 3),
  ],
};

// Flattened convenience list: every technique with its category attached.
export const ALL_TECHNIQUES = Object.entries(TECHNIQUES_BY_CATEGORY).flatMap(
  ([category, list]) => list.map((tech) => ({ ...tech, category }))
);

export const EFFORT_VALUES = ['Low', 'Medium', 'High'];
export const GAIN_VALUES = ['Low', 'Medium', 'High', 'Very High'];
export const RISK_VALUES = ['Low', 'Medium', 'High'];
export const STATUS_VALUES = ['planned', 'in-progress', 'researched', 'published'];

export function categoryBySlug(slug) {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function levelByNumber(level) {
  return MATURITY_LEVELS.find((l) => l.level === level);
}
