/**
 * Shared mock factories for common testing patterns.
 *
 * Usage:
 * ```ts
 * import { mockServerOnly, createMockRouter, createMockSession } from '@/test-utils/shared-mocks';
 * ```
 */

import { vi } from 'vitest';

/**
 * Mock for 'server-only' package - commonly needed for server actions
 */
export const mockServerOnly = () => {
  vi.mock('server-only', () => ({}));
};

/**
 * Mock for next/navigation with customizable router behavior
 */
export const createMockRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
});

/**
 * Mock for next-auth/react hooks session
 */
export const createMockSession = (
  overrides?: Partial<{
    user: { id: string; email: string; name: string; role: string };
    expires: string;
  }>
) => ({
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    ...overrides?.user,
  },
  expires: overrides?.expires ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

/**
 * Mock for sonner toast notifications
 */
export const createMockToast = () =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  });

/**
 * Factory for creating mock Prisma responses
 */
export function createMockPrismaResponse<T>(data: T) {
  return {
    findMany: vi.fn().mockResolvedValue(Array.isArray(data) ? data : [data]),
    findUnique: vi.fn().mockResolvedValue(data),
    findFirst: vi.fn().mockResolvedValue(data),
    create: vi.fn().mockResolvedValue(data),
    update: vi.fn().mockResolvedValue(data),
    delete: vi.fn().mockResolvedValue(data),
    count: vi.fn().mockResolvedValue(Array.isArray(data) ? data.length : 1),
  };
}

/**
 * Mock FormData factory for testing server actions
 */
export const createMockFormData = (entries: Record<string, string | Blob>) => {
  const formData = new FormData();
  Object.entries(entries).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
};

/**
 * Mock fetch response factory
 */
export function createMockFetchResponse<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  };
}

/**
 * Create a mock auth function that returns an admin session
 */
export const createMockAdminAuth = () =>
  vi.fn().mockResolvedValue({
    user: { id: 'admin-user-id', email: 'admin@example.com', role: 'admin' },
  });

/**
 * Create a mock auth function that returns a user session
 */
export const createMockUserAuth = () =>
  vi.fn().mockResolvedValue({
    user: { id: 'user-id', email: 'user@example.com', role: 'user' },
  });

/**
 * Create a mock auth function that returns null (no session)
 */
export const createMockNoAuth = () => vi.fn().mockResolvedValue(null);

/**
 * Create a mock useSession hook
 */
export const createMockUseSession = (session?: ReturnType<typeof createMockSession> | null) =>
  vi.fn(() => ({
    data: session,
    status: session ? 'authenticated' : 'unauthenticated',
    update: vi.fn(),
  }));

/**
 * Common test data factories
 */
export const createMockArtist = (overrides?: Record<string, unknown>) => ({
  id: 'artist-1',
  displayName: 'Test Artist',
  firstName: 'Test',
  surname: 'Artist',
  email: 'artist@example.com',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockRelease = (overrides?: Record<string, unknown>) => ({
  id: 'release-1',
  title: 'Test Release',
  artistId: 'artist-1',
  releaseDate: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockTrack = (overrides?: Record<string, unknown>) => ({
  id: 'track-1',
  title: 'Test Track',
  releaseId: 'release-1',
  duration: 180,
  trackNumber: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockUser = (overrides?: Record<string, unknown>) => ({
  id: 'user-1',
  email: 'user@example.com',
  name: 'Test User',
  role: 'user',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
