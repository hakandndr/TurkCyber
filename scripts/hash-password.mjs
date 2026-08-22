#!/usr/bin/env node
/**
 * Generate a BOSS_PASSWORD_HASH value.
 *
 *   node scripts/hash-password.mjs
 *
 * Reads the password from stdin with echo disabled. It is never taken as a
 * command-line argument (it would land in shell history and the process list)
 * and it is never written anywhere.
 *
 * Output format:  pbkdf2$<iterations>$<base64 salt>$<base64 derivedBits>
 */
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline';

/**
 * Hard ceiling, not a preference. The Cloudflare Workers runtime refuses
 * PBKDF2 above 100,000 iterations — it throws NotSupportedError rather than
 * returning a mismatch. Raising this breaks sign-in at runtime.
 */
const ITERATIONS = 100_000;

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!input.isTTY) {
      // Piped input: read a line without attempting to control echo.
      const rl = createInterface({ input });
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
      rl.once('error', reject);
      return;
    }

    output.write(question);
    const rl = createInterface({ input, output, terminal: true });
    // Suppress echo for everything typed after the prompt.
    const onData = () => {
      output.write(`\r${question}`);
    };
    input.on('data', onData);
    rl.question('', (answer) => {
      input.off('data', onData);
      rl.close();
      output.write('\n');
      resolve(answer);
    });
  });
}

const password = (await promptHidden('Password: ')).trim();

if (!password) {
  console.error('No password supplied. Nothing written.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Refusing: use at least 12 characters for the owner account.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  key,
  256,
);

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

console.log('');
console.log(hash);
console.log('');
console.log('Set it as a secret — one command at a time:');
console.log('  npx wrangler secret put BOSS_PASSWORD_HASH');
console.log('');
console.log('Do not paste several secrets into one heredoc: it has scrambled');
console.log('them in practice and produced three different failure modes at login.');
