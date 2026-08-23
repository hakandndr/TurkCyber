/**
 * Vitest global setup — produces the build the content tests assert against.
 *
 * ── Why this exists in this shape ─────────────────────────────────────────
 *
 * `tests/content.test.ts` verifies what actually ships, so it has to read real
 * build output. Two earlier attempts to arrange that were wrong:
 *
 *   1. "Run `pnpm build` before `pnpm test`." An ordering dependency nobody
 *      remembers, and CI is the only place it is reliably honoured.
 *
 *   2. "Build only when `dist/` is missing." This trusts `dist/` when it
 *      exists. A stale `dist/` from an earlier checkout then gets asserted
 *      against, and the suite fails with confusing mismatches — retired
 *      category ids in the sitemap, for instance — that have nothing to do
 *      with the current source.
 *
 * The rule now is simply: **the test run owns its own build.** This setup
 * removes `.test-dist/` and rebuilds it every time. It never reads `dist/`, so
 * a developer's build directory — absent, stale, or built with unusual
 * environment variables — cannot influence a single assertion.
 *
 * Vitest runs global setup to completion before any test file is collected, so
 * the output is guaranteed to exist before a test body reads it.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TEST_DIST } from './paths';

export default function setup(): void {
  // Always start from nothing. Astro would overwrite most files, but a page
  // deleted from the source would linger and could satisfy an assertion it
  // should now fail.
  rmSync(TEST_DIST, { recursive: true, force: true });

  const require = createRequire(import.meta.url);
  // Resolve the real Astro entry point rather than shelling out to `npx astro`.
  // Invoking it through Node directly avoids the `.cmd` shim, shell quoting and
  // PATH differences that make child processes behave differently on Windows.
  const astroEntry = join(dirname(require.resolve('astro/package.json')), 'astro.js');

  if (!existsSync(astroEntry)) {
    throw new Error(
      `Cannot find the Astro CLI at ${astroEntry}. Run your package manager's install first.`,
    );
  }

  console.log('[tests] building the site into .test-dist/ ...');

  execFileSync(process.execPath, [astroEntry, 'build', '--outDir', TEST_DIST], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Pin the mode explicitly. Vitest sets NODE_ENV=test and Astro's build
      // mode is derived from it — which is how a draft-containing build was
      // produced once before. The publication gate is fail-safe on its own now,
      // but the test build should still be the build a release produces.
      NODE_ENV: 'production',
      // Do not inherit a developer's shell or ignored .env file. This value is
      // passed only to the child build, so the parent test environment needs no
      // mutation or cleanup.
      SHOW_UNPUBLISHED: 'false',
    },
  });

  if (!existsSync(join(TEST_DIST, 'index.html'))) {
    throw new Error(
      `The build reported success but ${join(TEST_DIST, 'index.html')} is missing. ` +
        'Content tests cannot run against it.',
    );
  }
}
