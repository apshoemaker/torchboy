// Correctness, not style.
//
// There is deliberately no Prettier here. This codebase aligns trailing
// comments into columns and writes colour triplets as `1.00, 0.60, 0.26` so
// they read as a set; Prettier collapses both and has no option to preserve
// either. It wanted to rewrite 90 of 151 lines in one file. In a repo whose
// point is that the code can be read, that is the wrong trade - so the lint
// gate checks for bugs and leaves the formatting to the author.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', 'public/**'] },

  js.configs.recommended,

  // The game: runs in the browser.
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // The AudioWorklet processor runs in its own scope, off the main thread:
  // no window, no document, but `sampleRate`, `currentTime` and
  // `registerProcessor` are globals there.
  {
    files: ['src/audio/*.js'],
    languageOptions: {
      globals: {
        ...globals.worker,
        sampleRate: 'readonly',
        currentTime: 'readonly',
        currentFrame: 'readonly',
        registerProcessor: 'readonly',
        AudioWorkletProcessor: 'readonly',
      },
    },
  },

  // The server, the story middleware and the build tooling: Node.
  {
    files: ['server.mjs', 'vite.config.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  {
    rules: {
      // an unused argument is usually deliberate (a signature being matched);
      // an unused *variable* usually means a leftover or a typo
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-throw-literal': 'error',
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'require-atomic-updates': 'error',
    },
  },
];
