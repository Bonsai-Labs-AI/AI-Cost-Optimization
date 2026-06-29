// @ts-check
import { defineConfig } from 'astro/config';

// On GitHub Pages this is served from a project sub-path
// (https://bonsai-labs-ai.github.io/AI-Cost-Optimization/). We only apply that
// `base` in CI so local `npm run dev`/`preview` keep serving from the root.
const onGitHubPages = process.env.GITHUB_ACTIONS === 'true';

// Static research documentation site.
// Output is fully static HTML — no server needed, deployable anywhere.
export default defineConfig({
  site: onGitHubPages
    ? 'https://bonsai-labs-ai.github.io'
    : 'https://research.bonsai-labs.com',
  base: onGitHubPages ? '/AI-Cost-Optimization' : undefined,
  markdown: {
    // GitHub-flavored markdown (incl. footnotes) is enabled by default.
    // Footnotes are our primary inline-citation mechanism.
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
