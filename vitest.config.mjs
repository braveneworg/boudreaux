import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: {
      include: []
    }
  },
  esbuild: {
    target: 'node14'
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
  },
  css: {
    postcss: false,
  },
});