// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GET } from './route';

const mockAuth = vi.fn();

vi.mock('../../../../../auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

describe('GET /api/debug/session', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('should return 404 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Not found');

    vi.unstubAllEnvs();
  });

  it('should return 200 with full session data for admin users', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@test.com',
        username: 'adminuser',
        role: 'admin',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasSession).toBe(true);
    expect(data.hasUser).toBe(true);
    expect(data.hasUsername).toBe(true);
    expect(data.username).toBe('adminuser');
    expect(data.userId).toBe('admin-1');
    expect(data.userEmail).toBe('admin@test.com');
    expect(data.userRole).toBe('admin');
  });

  it('should return 401 when session is null', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return 401 when session has no user', async () => {
    mockAuth.mockResolvedValue({ user: undefined });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return 403 for non-admin users', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', email: 'user@test.com', role: 'user' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Admin access required');
  });

  it('should return 500 with error message when auth throws an Error', async () => {
    mockAuth.mockRejectedValue(new Error('Auth service unavailable'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get session');
    expect(data.message).toBe('An unexpected error occurred.');
  });

  it('should return 500 with generic error message when auth throws a non-Error', async () => {
    mockAuth.mockRejectedValue('some string error');

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to get session');
    expect(data.message).toBe('An unexpected error occurred.');
  });

  it('should return hasUsername as false when admin has no username set', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'admin-2',
        email: 'admin2@test.com',
        username: undefined,
        role: 'admin',
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasUsername).toBe(false);
    expect(data.username).toBeUndefined();
    expect(data.userId).toBe('admin-2');
    expect(data.userEmail).toBe('admin2@test.com');
    expect(data.userRole).toBe('admin');
  });
});
