// Generate a templated stub markdown file for every technique in the taxonomy.
// Idempotent: existing files are NEVER overwritten (authored content is safe).
//
//   node scripts/generate-stubs.mjs           # create missing stubs
//   node scripts/generate-stubs.mjs --report  # just print what's missing
//
import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TECHNIQUES, categoryBySlug } from '../src/data/taxonomy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, '../src/content/techniques');
const reportOnly = process.argv.includes('--report');

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function stub({ title, category, slug, level }) {
  const cat = categoryBySlug(category);
  return `---
title: "${title}"
category: ${category}
maturityLevel: ${level}
maturityProvisional: true
shortDescription: "TODO — one-sentence description of the technique and the cost problem it addresses."
# effort: Low | Medium | High            # set during research
# gain: Low | Medium | High | Very High  # set during research
# riskToQuality: Low | Medium | High      # set during research
detectionSignals: []
measurementMethods: []
status: planned
sources: []
related: []
---

> **Status: planned.** This page is a stub. See \`docs/RESEARCH_PLAN.md\` for the
> research workflow and \`docs/TEMPLATE.md\` for how to fill each section.
> Category: **${cat?.label ?? category}**.

## Overview

TODO — what the technique is, and the specific cost problem it solves.

## Detailed Approach & Techniques

TODO — concrete methods, variants, technical requirements, implementation steps.
Cite sources inline with footnotes, e.g. a claim about caching.[^example]

## Example Where It Works

TODO — a realistic use case where this clearly pays off.

## Example Where It Would NOT Work

TODO — a realistic case where this is ineffective, risky, or not worth it.

[^example]: Replace with a real source. Keep the structured \`sources\` frontmatter
in sync so the References section stays authoritative.
`;
}

let created = 0;
let skipped = 0;
const missing = [];

for (const tech of ALL_TECHNIQUES) {
  const file = join(CONTENT_DIR, tech.category, `${tech.slug}.md`);
  if (await exists(file)) {
    skipped++;
    continue;
  }
  missing.push(`${tech.category}/${tech.slug}`);
  if (reportOnly) continue;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, stub(tech), 'utf8');
  created++;
}

if (reportOnly) {
  console.log(`Missing ${missing.length} of ${ALL_TECHNIQUES.length} technique files:`);
  missing.forEach((m) => console.log('  ' + m));
} else {
  console.log(
    `Stub generation complete. Created ${created}, skipped ${skipped} existing, ` +
      `${ALL_TECHNIQUES.length} total.`
  );
}
