// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { UserService } from '@/lib/services/user-service';
import { loggers } from '@/lib/utils/logger';

import { POST } from './route';

vi.mock('server-only', () => ({}));

const mockSession = {
  user: { id: 'user-123', email: 'test@test.com', name: 'Test User', role: 'user' },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => (request: unknown, context: unknown) =>
    handler(request, context, mockSession),
}));

const limiterCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: { check: limiterCheckMock },
  PUBLIC_LIMIT: 30,
}));

// The route delegates the write to the service, which owns the data-access
// (duplicate detection, error translation). Mock at the service boundary so the
// route spec exercises only route-level behavior (status codes, enumeration
// defense, logging) without reaching Prisma.
vi.mock('@/lib/services/user-service', () => ({
  UserService: {
    updateUsername: vi.fn(),
  },
}));

const updateUsernameMock = vi.mocked(UserService.updateUsername);

const createRequest = (body: Record<string, unknown>): NextRequest =>
  new NextRequest('http://localhost:3000/api/user/username', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/user/username', () => {
  beforeEach(() => {
    limiterCheckMock.mockResolvedValue(undefined);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const request = createRequest({ username: 'newuser', confirmUsername: 'newuser' });
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(429);
    expect(updateUsernameMock).not.toHaveBeenCalled();
  });

  it('should update username successfully and return 200 with available:true', async () => {
    updateUsernameMock.mockResolvedValue({ success: true, duplicate: false });

    const request = createRequest({ username: 'newuser', confirmUsername: 'newuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Username updated successfully');
    expect(data.username).toBe('newuser');
    expect(updateUsernameMock).toHaveBeenCalledWith('user-123', 'newuser');
  });

  it('should return 400 for a username that is too short', async () => {
    const request = createRequest({ username: 'a', confirmUsername: 'a' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid username format');
    expect(data.details).toBeDefined();
    expect(updateUsernameMock).not.toHaveBeenCalled();
  });

  it('should return 400 for a username with invalid characters', async () => {
    const request = createRequest({ username: 'bad user!', confirmUsername: 'bad user!' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid username format');
    expect(data.details).toBeDefined();
    expect(updateUsernameMock).not.toHaveBeenCalled();
  });

  it('should return 400 when username and confirmUsername do not match', async () => {
    const request = createRequest({ username: 'validuser', confirmUsername: 'differentuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid username format');
    expect(data.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'Usernames do not match' })])
    );
    expect(updateUsernameMock).not.toHaveBeenCalled();
  });

  it('should return 200 with available:false when username is taken', async () => {
    updateUsernameMock.mockResolvedValue({ success: false, duplicate: true });

    const request = createRequest({ username: 'takenuser', confirmUsername: 'takenuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(false);
    expect(data.error).toBe('This username is not available. Please choose another.');
  });

  it('should return 500 when an unexpected error occurs during update', async () => {
    updateUsernameMock.mockRejectedValue(new Error('Database connection lost'));

    const loggerErrorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('An error occurred while updating the username');

    loggerErrorSpy.mockRestore();
  });

  it('should log full error in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    updateUsernameMock.mockRejectedValue(new Error('Dev debug error'));

    const loggerErrorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(500);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Error updating username', expect.any(Error));

    loggerErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('should log "Unknown error" when thrown value is not an Error instance', async () => {
    updateUsernameMock.mockRejectedValue('a plain string error');

    const loggerErrorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(500);
    expect(loggerErrorSpy).toHaveBeenCalledWith('Error updating username', 'Unknown error');

    loggerErrorSpy.mockRestore();
  });

  it('should accept a valid username with underscores and dashes', async () => {
    updateUsernameMock.mockResolvedValue({ success: true, duplicate: false });

    const request = createRequest({
      username: 'my_user-name99',
      confirmUsername: 'my_user-name99',
    });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.success).toBe(true);
    expect(data.username).toBe('my_user-name99');
  });
});
