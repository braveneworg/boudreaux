// Mock for next/server to resolve ESM import issues in tests
// This file allows next-auth to import 'next/server' without .js extension

// Re-export everything from the actual Next.js server exports
export * from 'next/dist/server/web/exports/index.js';
export { default } from 'next/dist/server/web/exports/index.js';
