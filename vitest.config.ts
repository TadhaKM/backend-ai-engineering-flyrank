import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `templates/` holds copy-only scaffolds with placeholder tokens — never test them.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', 'templates/**'],
  },
});
