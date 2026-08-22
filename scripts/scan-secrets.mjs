#!/usr/bin/env node
/**
 * Pre-push secret scan.
 *
 * The GitHub repository is public: assume every committed byte is public
 * forever. This looks for credential shapes and for files that must never be
 * tracked, and exits non-zero so it can gate CI and a pre-push hook.
 *
 *   node scripts/scan-secrets.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const PATTERNS = [
  { name: 'Cloudflare API token', re: /\b[A-Za-z0-9_-]{40}\b(?=.*(?:CLOUDFLARE|CF_API))/i },
  {
    name: 'Generic API token assignment',
    re: /(api[_-]?token|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/i,
  },
  {
    name: 'Wrangler secret value',
    re: /(SESSION_SECRET|TURNSTILE_SECRET_KEY|COMMENT_IP_PEPPER)\s*[:=]\s*['"][^'"\s]{8,}['"]/,
  },
  { name: 'PBKDF2 password hash', re: /pbkdf2\$\d{4,6}\$[A-Za-z0-9+/=]{16,}\$[A-Za-z0-9+/=]{16,}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Bearer token literal', re: /Bearer\s+[A-Za-z0-9\-._~+/]{30,}/ },
];

/** Files that must never appear in the index, whatever .gitignore says. */
const FORBIDDEN_PATHS = [
  /^\.dev\.vars/,
  /^\.env(?!\.example)/,
  /(^|\/)private\//,
  /\.pem$/,
  /\.key$/,
];

/** Files allowed to contain pattern-shaped text: docs and the scanner itself. */
const ALLOWLIST = [
  'scripts/scan-secrets.mjs',
  'scripts/hash-password.mjs',
  '.env.example',
  'SECURITY.md',
  'ARCHITECTURE.md',
  'HANDOFF.md',
  'PRODUCTION_CUTOVER.md',
  'tests/helpers.ts',
  'tests/auth.test.ts',
  'tests/boss.test.ts',
];

let tracked;
try {
  tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.error('scan-secrets: not a git repository (or git unavailable).');
  process.exit(2);
}

const findings = [];

for (const file of tracked) {
  for (const pattern of FORBIDDEN_PATHS) {
    if (pattern.test(file)) {
      findings.push({ file, line: 0, what: 'file must never be tracked' });
    }
  }

  if (ALLOWLIST.includes(file)) continue;
  if (!existsSync(file)) continue;
  if (/\.(png|jpe?g|webp|avif|gif|ico|woff2?|pdf|zip)$/i.test(file)) continue;

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  content.split('\n').forEach((line, index) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) findings.push({ file, line: index + 1, what: name });
    }
  });
}

if (findings.length > 0) {
  console.error('scan-secrets: potential secrets found\n');
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.what}`);
  }
  console.error('\nRemove them, rotate anything already exposed, and re-run.');
  process.exit(1);
}

console.log(`scan-secrets: clean (${tracked.length} tracked files checked)`);
