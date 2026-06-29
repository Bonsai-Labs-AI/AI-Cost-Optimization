// Delete every PLANNED stub technique file so `gen:stubs` can recreate them with
// the current taxonomy's level/title/category. Authored pages (status other than
// `planned`) are preserved. Use after re-tiering/renaming in taxonomy.mjs:
//
//   node scripts/resync-stubs.mjs && npm run gen:stubs
//
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = resolve(__dirname, '../src/content/techniques');

let deleted = 0;
let kept = 0;

const cats = await readdir(CONTENT_DIR, { withFileTypes: true });
for (const cat of cats) {
  if (!cat.isDirectory()) continue;
  const catDir = join(CONTENT_DIR, cat.name);
  for (const f of await readdir(catDir)) {
    if (!f.endsWith('.md')) continue;
    const p = join(catDir, f);
    const text = await readFile(p, 'utf8');
    const m = text.match(/^status:\s*(\S+)/m);
    const status = m ? m[1].replace(/['"]/g, '') : 'planned';
    if (status === 'planned') {
      await rm(p);
      deleted++;
    } else {
      kept++;
      console.log(`kept (status: ${status})  ${cat.name}/${f}`);
    }
  }
}
console.log(`\nResync: deleted ${deleted} planned stub(s), kept ${kept} authored file(s).`);
