// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

/**
 * TurkCyber builds to a static site. Dynamic routes (/collect, /api/*, /boss/*)
 * are handled by the Cloudflare Worker in `worker/`, which serves this build
 * output through its ASSETS binding. Keeping the content site static means a
 * Worker or D1 outage can never prevent an article from rendering.
 */
export default defineConfig({
  integrations: [mdx()],
  site: 'https://turkcyber.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
  compressHTML: true,
});
