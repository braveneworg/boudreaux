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
    pool: 'forks', // Use forks for better test isolation (matches CI behavior)

    // Vitest 4: Worker configuration
    // Auto-detect workers but use forks pool for proper isolation
    maxWorkers: undefined,

    isolate: true, // Required for test isolation
    fileParallelism: true, // Run test files in parallel for speed
    testTimeout: 5000,

    // Randomize test order to catch hidden dependencies
    // Use a fixed seed for reproducible test order across local and CI environments
    sequence: {
      shuffle: true,
      seed: 12345, // Fixed seed for reproducible random order
    },

    // Disable typecheck by default for faster runs
    typecheck: {
      enabled: false,
    },

    // Fail fast on first error in CI for faster feedback
    bail: process.env.CI ? 1 : 0,

    globals: true,
    watch: false,
    setupFiles: ['./setupTests.ts'],

    // Optimize dependency pre-bundling
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
      // Inline small dependencies for faster loading
      interopDefault: true,
    },

    // Reporter optimizations
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: process.env.CI ? { junit: './test-results.xml' } : undefined,

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

        // Test utilities - not production code
        '**/test-utils/**',

        // Pure barrel/re-export files with no logic
        '**/components/forms/fields/index.ts',

        // shadcn/ui primitives that wrap Radix UI with no custom logic
        // These components only add styling/className and delegate all behavior to Radix
        '**/components/ui/context-menu.tsx',
        '**/components/ui/menubar.tsx',
        '**/components/ui/calendar.tsx',
        '**/components/ui/carousel.tsx',
        '**/components/ui/scroll-area.tsx',
        '**/components/ui/sidebar.tsx',
        '**/components/ui/form.tsx',
        '**/components/ui/chart.tsx',
        // TODO: add E2E tests for these components using playwright
        // Complex UI components with interactive state requiring E2E tests
        '**/components/ui/datepicker.tsx',
        '**/components/ui/media-uploader.tsx',
        '**/components/ui/image-uploader.tsx',
        '**/components/ui/resizable-text-box.tsx',
        '**/**/media-uploader.tsx',
        '**/**/image-uploader.tsx',
        '**/components/forms/artist-form.tsx',
        '**/admin/data-views/data-view.tsx',
        // TODO: add E2E tests for these components using playwright
        // Media player with Video.js integration - requires E2E testing
        '**/components/ui/audio/media-player/**',
        '**/components/ui/playlist-player.tsx',
        '**/components/ui/audio-player.tsx',
        '**/components/ui/audio/carousel-number-up.tsx',

        // TODO: add S3 integration testing with upload utility
        // Direct upload utility requires S3 integration testing
        '**/lib/utils/direct-upload.ts',

        // Presigned upload requires S3 credentials
        '**/lib/actions/presigned-upload-actions.ts',

        // Image actions that require S3 integration testing
        '**/lib/actions/artist-image-actions.ts',
        '**/lib/actions/group-image-actions.ts',
        '**/lib/actions/register-image-actions.ts',

        // Simple wrapper actions with no logic beyond calling services (untested)
        '**/lib/actions/artist-actions.ts',
        '**/lib/actions/create-featured-artist-action.ts',
        '**/lib/actions/create-group-action.ts',
        '**/lib/actions/update-group-action.ts',

        // Prisma client singleton - initialization code with environment branching
        '**/lib/prisma.ts',

        // CSS files
        '**/*.css',
      ],
      // Coverage thresholds
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
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
      { find: '@/test-utils', replacement: path.resolve(process.cwd(), './src/test-utils') },
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
