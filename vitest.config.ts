import * as path from 'node:path';

import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
  },

  // Cache directory for faster subsequent builds
  cacheDir: 'node_modules/.vite',

  // SSR configuration to handle Node.js module resolution
  ssr: {
    noExternal: ['next-auth'],
  },

  // Optimize build for faster test startup
  esbuild: {
    target: 'node20',
  },

  test: {
    root: import.meta.dirname,
    name: packageJson.name,
    environment: 'jsdom',

    // Performance optimizations
    css: false, // Don't process CSS in tests
    pool: 'vmThreads', // Fast VM-based worker threads
    isolate: true, // Required for test isolation
    fileParallelism: true, // Run test files in parallel
    testTimeout: 5000,

    // Disable typecheck by default for faster runs
    typecheck: {
      enabled: false,
    },

    globals: true,
    watch: false,
    setupFiles: ['./setupTests.ts'],

    // Optimize dependencies to speed up test startup
    deps: {
      optimizer: {
        web: {
          include: [
            '@testing-library/react',
            '@testing-library/jest-dom',
            '@testing-library/user-event',
            'react',
            'react-dom',
          ],
        },
      },
    },

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

        // Mocks directory
        '**/__mocks__/**',

        // Complex UI components that require extensive user interaction testing
        // These are excluded because they have their own manual/E2E testing
        '**/context-menu.tsx',
        '**/menubar.tsx',
        '**/image-uploader.tsx',

        // Form components with complex state (tested via integration tests)
        '**/artist-form.tsx',

        // Server action files that require complex mocking
        '**/presigned-upload-actions.ts',
        '**/release-image-actions.ts',

        // Direct upload utility (requires S3 integration)
        '**/direct-upload.ts',

        // Datepicker has complex date/calendar interactions
        '**/datepicker.tsx',
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
    alias: [
      { find: '@/components', replacement: path.resolve(process.cwd(), './src/app/components') },
      { find: '@/lib', replacement: path.resolve(process.cwd(), './src/lib') },
      { find: '@/ui', replacement: path.resolve(process.cwd(), './src/app/components/ui') },
      { find: '@/hooks', replacement: path.resolve(process.cwd(), './src/app/hooks') },
      { find: '@/utils', replacement: path.resolve(process.cwd(), './src/lib/utils') },
      { find: '@', replacement: path.resolve(process.cwd(), './src') },
      // Keep only next/server alias - let vi.mock handle next/navigation
      {
        find: 'next/server',
        replacement: path.resolve(process.cwd(), './__mocks__/next/server.js'),
      },
    ],
    conditions: ['import', 'module', 'browser', 'default'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.AUTH_SECRET': JSON.stringify('test-secret-key-for-testing-purposes-only'),
    'process.env.AUTH_URL': JSON.stringify('http://localhost:3000'),
  },
});
