/**
 * Where the test suite's own build output lives.
 *
 * Tests never read `dist/`. `dist/` is the developer's build: it may be absent,
 * it may be stale, and it may have been produced with different environment
 * variables. Trusting it made the suite pass or fail depending on what happened
 * to be on disk — a stale `dist/` failed the content tests against retired
 * category ids, and a missing one threw ENOENT before any test ran.
 *
 * `tests/global-setup.ts` deletes this directory and rebuilds into it on every
 * run, so every assertion is made against output this run produced.
 *
 * Both the setup and the tests import this constant, so there is no environment
 * variable to plumb between processes and no way for the two to disagree.
 */
import { resolve } from 'node:path';

export const TEST_DIST = resolve(process.cwd(), '.test-dist');
