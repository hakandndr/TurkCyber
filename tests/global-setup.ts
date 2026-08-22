/**
 * Vitest global setup.
 *
 * `tests/content.test.ts` asserts against the built site, because what ships is
 * what matters. That used to make `pnpm test` depend on `pnpm build` having
 * been run first: on a clean tree the suite failed with ENOENT on
 * `dist/rehberler` before a single test executed.
 *
 * The build is now a precondition the test run establishes itself. If `dist/`
 * is already present (CI builds before testing) this is a no-op.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default function setup(): void {
  const dist = join(process.cwd(), 'dist');

  // `dist/index.html` rather than the directory: an interrupted build can leave
  // an empty `dist/` behind, which would satisfy a directory check and then
  // fail every assertion for a misleading reason.
  if (existsSync(join(dist, 'index.html'))) return;

  console.log('[tests] dist/ missing — building the site first…');
  execFileSync('npx', ['astro', 'build'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    // Windows resolves `npx` through the shell.
    shell: process.platform === 'win32',
  });
}
