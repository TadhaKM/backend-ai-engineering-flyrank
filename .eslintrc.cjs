/**
 * Root ESLint configuration (legacy `.eslintrc` format, CommonJS).
 *
 * Kept intentionally type-UNAWARE (no `parserOptions.project`) so linting stays
 * fast and never breaks when a brand-new assignment folder is added before its
 * tsconfig is wired up. Correctness that needs types is handled by `tsc`.
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // Keep this last so Prettier owns all formatting decisions.
    'prettier',
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '**/*.gitkeep',
    // Templates contain placeholder tokens and are copied, not run.
    'templates/',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
};
