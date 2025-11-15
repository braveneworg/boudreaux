import * as path from 'node:path';

import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
  },

  // SSR configuration to handle Node.js module resolution
  ssr: {
    noExternal: ['next-auth'],
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
      // TODO: Coverage threshold strategy
      // Current project-wide coverage: ~31% lines (as of 2025-11-15)
      //
      // Analysis:
      // - Critical business logic (lib/actions/utils/validation): 85-100% ✅
      // - Main gap: Pages (~20 files) and UI components (~50+ files) at 0-20%
      // - Reaching 90% project-wide would require ~200+ additional tests
      //
      // Recommended approach:
      // 1. Maintain high coverage (>90%) for business logic via code reviews
      // 2. Add E2E tests for pages/user flows (not unit tests)
      // 3. Re-evaluate project-wide thresholds after E2E test suite is established
      //
      // When business logic coverage is consistently >90% and E2E tests cover
      // critical user flows, consider enabling these thresholds:
      // thresholds: {
      //   lines: 85,
      //   functions: 85,
      //   branches: 80,
      //   statements: 85,
      // },
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
      // Keep only next/server alias - let vi.mock handle next/navigation
      'next/server': path.resolve(process.cwd(), './__mocks__/next/server.js'),
    },
    conditions: ['import', 'module', 'browser', 'default'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.AUTH_SECRET': JSON.stringify('test-secret-key-for-testing-purposes-only'),
    'process.env.AUTH_URL': JSON.stringify('http://localhost:3000'),
  },
});
