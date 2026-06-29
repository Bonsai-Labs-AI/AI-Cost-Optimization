// @ts-check
import { defineConfig } from 'astro/config';

// Static research documentation site.
// Output is fully static HTML — no server needed, deployable anywhere.
export default defineConfig({
  site: 'https://research.bonsai-labs.com',
  // Base path can be set if hosted under a sub-path (e.g. GitHub Pages project site).
  // base: '/bonsai_research',
  markdown: {
    // GitHub-flavored markdown (incl. footnotes) is enabled by default.
    // Footnotes are our primary inline-citation mechanism.
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
