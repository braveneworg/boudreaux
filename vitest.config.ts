import * as path from 'node:path';

import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
  },

  test: {
    root: import.meta.dirname,
    name: packageJson.name,
    environment: 'jsdom',

    // Reduce overhead
    css: false, // Don't process CSS in tests

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    globals: true,
    watch: false,
    setupFiles: ['./setupTests.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'clover'],
      exclude: [
        // Configuration files
        '**/*.config.{ts,js,mjs,cjs}',
        '**/vitest.config.ts',
        '**/next.config.ts',
        '**/postcss.config.mjs',
        '**/eslint.config.mjs',
        '**/tsconfig*.json',

        // Type declarations and interfaces
        '**/*.d.ts',
        '**/types/**',

        // Prisma
        '**/prisma/**',
        '**/*.prisma',

        // Setup and tooling
        '**/setupTests.ts',
        '**/auth.ts',

        // Build outputs and dependencies
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',

        // Test files themselves
        '**/*.{test,spec}.{ts,tsx,js,jsx}',

        // Scripts and utilities that don't need testing
        '**/scripts/**',

        // Middleware (already has its own test)
        // Add more specific exclusions as needed
      ],
    },

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.config.{ts,js,mjs,cjs}',
      '**/setupTests.ts',
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
});
