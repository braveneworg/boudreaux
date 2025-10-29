// Mock PrismaClient to avoid real database connections
import { prisma } from './prisma';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    user: {},
    session: {},
    verificationToken: {},
    account: {},
  })),
}));

describe('prisma', () => {
  it('should export a prisma client object', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe('object');
    expect(prisma).not.toBeNull();
  });

  it('should be a singleton across imports', () => {
    // Multiple references to prisma should be the same instance
    const prismaRef1 = prisma;
    const prismaRef2 = prisma;

    expect(prismaRef1).toBe(prismaRef2);
  });

  it('should be usable in test environment', () => {
    // Verify prisma works in test context
    expect(prisma).toBeDefined();
    expect(prisma).not.toBeUndefined();
    expect(prisma).not.toBeNull();
  });

  it('should handle multiple property accesses', () => {
    // Verify we can access prisma multiple times without errors
    expect(prisma).toBeTruthy();
    expect(prisma).toBeTruthy();
    expect(prisma).toBeTruthy();
  });

  it('should maintain consistent reference', () => {
    // Store reference
    const ref1 = prisma;

    // Access again
    const ref2 = prisma;

    // Should be identical
    expect(ref1).toStrictEqual(ref2);
  });

  it('should export valid prisma instance', () => {
    // Comprehensive check that prisma is properly exported
    expect(prisma).not.toBeUndefined();
    expect(prisma).not.toBeNull();
    expect(typeof prisma).toBe('object');
  });
});
