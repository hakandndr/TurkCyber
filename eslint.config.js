import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  { ignores: ['dist/**', '.astro/**', '.wrangler/**', 'node_modules/**', '*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  {
    rules: {
      // Unused args are fine when prefixed, which keeps handler signatures honest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` is banned; the Worker types are precise enough not to need it.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      // console is the Worker's only log channel.
      'no-console': 'off',
    },
  },

  {
    // TypeScript resolves identifiers itself; no-undef duplicates that work and
    // produces false positives on platform globals.
    files: ['**/*.ts', '**/*.astro'],
    rules: { 'no-undef': 'off' },
  },

  {
    // Sanitisers must match control characters — that is their entire purpose.
    // The ranges are written as escapes and covered by tests.
    files: ['worker/lib/sanitize.ts', 'scripts/import-legacy-analytics.mjs'],
    rules: { 'no-control-regex': 'off' },
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    // Plain browser scripts served as static assets.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      // Empty catch blocks are deliberate here: analytics must never throw on
      // a visitor's page, so every failure path is swallowed on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
