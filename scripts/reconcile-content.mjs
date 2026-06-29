// Reconcile content files against the taxonomy:
//  - delete any technique .md whose <category>/<slug> is no longer in the taxonomy
//    (removed, merged, or renamed away),
//  - remove now-empty category directories.
// Authored files for techniques still in the taxonomy are preserved.
// Run `npm run gen:stubs` afterwards to create stubs for newly added techniques.
//
//   node scripts/reconcile-content.mjs            # apply
//   node scripts/reconcile-content.mjs --dry-run  # just report
//
import { readdir, rm, rmdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ALL_TECHNIQUES } from '../src/data/taxonomy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, '../src/content/techniques');
const dryRun = process.argv.includes('--dry-run');

const valid = new Set(ALL_TECHNIQUES.map((t) => `${t.category}/${t.slug}`));

let deleted = 0;
let keptDirs = 0;

const categories = await readdir(CONTENT_DIR, { withFileTypes: true });
for (const cat of categories) {
  if (!cat.isDirectory()) continue;
  const catDir = join(CONTENT_DIR, cat.name);
  const files = await readdir(catDir);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  for (const f of mdFiles) {
    const id = `${cat.name}/${f.replace(/\.md$/, '')}`;
    if (!valid.has(id)) {
      console.log(`${dryRun ? '[dry] would delete' : 'delete'}  ${id}.md`);
      deleted++;
      if (!dryRun) await rm(join(catDir, f));
    }
  }

  // Remove the directory if it now has no .md files left.
  const remaining = (await readdir(catDir)).filter((f) => f.endsWith('.md'));
  if (remaining.length === 0) {
    console.log(`${dryRun ? '[dry] would remove dir' : 'remove dir'}  ${cat.name}/`);
    if (!dryRun) {
      // best-effort: only remove if truly empty
      try {
        await rmdir(catDir);
      } catch {
        /* not empty (non-md files) — leave it */
      }
    }
  } else {
    keptDirs++;
  }
}

console.log(
  `\nReconcile ${dryRun ? '(dry-run) ' : ''}complete. ` +
    `${deleted} file(s) ${dryRun ? 'to delete' : 'deleted'}, ${keptDirs} categor(ies) kept.`
);
