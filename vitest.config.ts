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

    typecheck: {
      enabled: true,
      tsconfig: path.join(import.meta.dirname, 'tsconfig.json'),
    },

    globals: true,
    watch: false,
    setupFiles: ['./setupTests.ts'],
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
