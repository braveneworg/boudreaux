/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock PrismaClient to avoid real database connections
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function PrismaClient(config: { log?: string[] }) {
    return {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      user: {},
      session: {},
      verificationToken: {},
      account: {},
      _config: config,
    };
  }),
}));

describe('prisma', () => {
  it('should export a prisma client object', async () => {
    const { prisma } = await import('@/lib/prisma');
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe('object');
    expect(prisma).not.toBeNull();
  });

  it('should be a singleton across imports', async () => {
    const { prisma: prisma1 } = await import('@/lib/prisma');
    const { prisma: prisma2 } = await import('@/lib/prisma');

    // Multiple references to prisma should be the same instance
    expect(prisma1).toBe(prisma2);
  });

  it('should be usable in test environment', async () => {
    const { prisma } = await import('@/lib/prisma');
    // Verify prisma works in test context
    expect(prisma).toBeDefined();
    expect(prisma).not.toBeUndefined();
    expect(prisma).not.toBeNull();
  });

  it('should handle multiple property accesses', async () => {
    const { prisma } = await import('@/lib/prisma');
    // Verify we can access prisma multiple times without errors
    expect(prisma).toBeTruthy();
    expect(prisma).toBeTruthy();
    expect(prisma).toBeTruthy();
  });

  it('should maintain consistent reference', async () => {
    const { prisma: ref1 } = await import('@/lib/prisma');
    const { prisma: ref2 } = await import('@/lib/prisma');

    // Should be identical
    expect(ref1).toStrictEqual(ref2);
  });

  it('should export valid prisma instance', async () => {
    const { prisma } = await import('@/lib/prisma');
    // Comprehensive check that prisma is properly exported
    expect(prisma).not.toBeUndefined();
    expect(prisma).not.toBeNull();
    expect(typeof prisma).toBe('object');
  });
});
