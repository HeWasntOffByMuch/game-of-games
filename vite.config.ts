import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages serves a project site from /<repo>/, so the built assets need
 * that prefix. The deploy workflow passes it in from the Pages configuration
 * rather than hard-coding the repository name here; locally it stays at '/'.
 */
const rawBase = process.env.BASE_PATH ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export default defineConfig({
  base,
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
