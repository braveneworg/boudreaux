// Mock for next/server to resolve ESM import issues in tests
// This file allows next-auth to import 'next/server' without .js extension
// The actual mocking is done in setupTests.ts with vi.mock()

// Export minimal structure - the real implementation comes from vi.mock in setupTests.ts
// This file exists only to satisfy Node.js ESM module resolution
const mockServer = {
  NextRequest: class NextRequest {},
  NextResponse: class NextResponse {},
};

export default mockServer;
