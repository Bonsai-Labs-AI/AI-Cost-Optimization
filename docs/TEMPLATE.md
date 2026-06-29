# Technique authoring template

Every technique is a single Markdown file at
`src/content/techniques/<category>/<slug>.md`. The frontmatter is **validated at
build time** against the schema in `src/content.config.ts` — a typo in a field name
or an invalid enum value will fail `npm run build`, so you get a guardrail for free.

## Frontmatter fields

```yaml
---
title: "Human-readable name"
category: caching-reuse            # one of the 11 category slugs (see taxonomy.mjs)
maturityLevel: 1                   # 0–4, the pyramid tier
maturityProvisional: false        # set false once research confirms the level
shortDescription: "One sentence: what it is + the cost problem it solves."

effort: Low                       # Low | Medium | High
gain: Very High                   # Low | Medium | High | Very High
riskToQuality: Low                # Low | Medium | High

detectionSignals:                 # how to spot that a client needs this
  - "..."
measurementMethods:               # how to prove it worked
  - "..."

status: published                 # planned | in-progress | researched | published
lastUpdated: "2026-06-24"
related:                          # optional cross-links: "<category>/<slug>"
  - "prompt-context/static-dynamic-prompt-separation"

sources:                          # structured bibliography → rendered "References"
  - id: anthropic-pc              # short key; reuse as the footnote id in the body
    title: "Prompt caching"
    publisher: "Anthropic — Claude API Docs"
    authors: ""                   # optional
    year: 2026
    url: "https://platform.claude.com/..."
    accessed: "2026-06-24"        # ISO date you last verified the URL
    kind: docs                    # docs|paper|blog|benchmark|talk|repo|pricing|other
    note: "Key fact this source backs (optional)."
---
```

## Body sections (use these exact H2 headings)

```markdown
## Overview
What the technique is and the specific cost problem it addresses.

## Detailed Approach & Techniques
Concrete methods, variants, technical requirements, implementation steps.
Use sub-headings (###) freely. Cite inline with footnotes.[^anthropic-pc]

## Example Where It Works
A realistic scenario where it clearly pays off (ideally with rough numbers).

## Example Where It Would NOT Work
A realistic scenario where it is ineffective, risky, or not worth it.

[^anthropic-pc]: Short citation — Org, "Title" — <https://url>
```

## Citations — the rule we hold to

- **Inline citations use GFM footnotes** `[^id]`. They auto-number and back-link.
- **The `id` of each footnote matches the `id` of a structured `sources` entry.**
  Keep them in sync: every inline `[^x]` should have a `sources` entry with `id: x`,
  and every source should be cited at least once.
- Prefer **primary sources**: provider docs, pricing pages, papers, official repos.
  Secondary blogs are fine for color but back every quantitative claim with a primary.
- Always set `accessed:` — provider pricing and limits change.

See `src/content/techniques/caching-reuse/prompt-caching-prefix-caching.md` for a
fully worked reference example.
