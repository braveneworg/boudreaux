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
      // TODO: Add this section back once we've established >= 90% coverage project-wide across metrics: lines,
      // functions, statements, and branches
      // thresholds: {
      //   lines: 95,
      //   functions: 95,
      //   branches: 95,
      //   statements: 95,
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
      // More specific aliases first (order matters for matching)
      '@/components': path.resolve(process.cwd(), './src/app/components'),
      '@/utils': path.resolve(process.cwd(), './src/app/lib/utils'),
      '@/ui': path.resolve(process.cwd(), './src/app/components/ui'),
      '@/lib': path.resolve(process.cwd(), './src/app/lib'),
      '@/hooks': path.resolve(process.cwd(), './src/app/hooks'),
      // General @ alias last
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
