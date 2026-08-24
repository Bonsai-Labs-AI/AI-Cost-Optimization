// @ts-check
import { defineConfig } from 'astro/config';

// Deployed as a subpage of the AI-Cost-Optimization GitHub Pages site
// (https://bonsai-labs-ai.github.io/AI-Cost-Optimization/agentic-coding/) by that
// repo's deploy workflow. We only apply the `base` in CI so local
// `npm run dev`/`preview` keep serving from root.
const onGitHubPages = process.env.GITHUB_ACTIONS === 'true';

// Static research documentation site — fully static HTML, deployable anywhere.
export default defineConfig({
  site: onGitHubPages
    ? 'https://bonsai-labs-ai.github.io'
    : 'https://research.bonsai-labs.com',
  base: onGitHubPages ? '/AI-Cost-Optimization/agentic-coding' : undefined,
  markdown: {
    // GitHub-flavored markdown (incl. footnotes) is enabled by default.
    // Footnotes are our primary inline-citation mechanism.
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
