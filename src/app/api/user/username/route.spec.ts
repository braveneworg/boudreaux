// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { POST } from './route';

const mockSession = {
  user: { id: 'user-123', email: 'test@test.com', name: 'Test User', role: 'user' },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth: (handler: Function) => (request: unknown, context: unknown) =>
    handler(request, context, mockSession),
}));

const mockPrismaUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockPrismaUpdate(...args),
    },
  },
}));

vi.mock('@prisma/client/runtime/library', () => {
  class MockPrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
      this.clientVersion = opts.clientVersion;
      this.name = 'PrismaClientKnownRequestError';
    }
  }
  return { PrismaClientKnownRequestError: MockPrismaClientKnownRequestError };
});

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/username', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/user/username', () => {
  it('should update username successfully and return 200 with available:true', async () => {
    mockPrismaUpdate.mockResolvedValue({ id: 'user-123', username: 'newuser' });

    const request = createRequest({ username: 'newuser', confirmUsername: 'newuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Username updated successfully');
    expect(data.username).toBe('newuser');
    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { username: 'newuser' },
    });
  });

  it('should return 400 for a username that is too short', async () => {
    const request = createRequest({ username: 'a', confirmUsername: 'a' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid username format');
    expect(data.details).toBeDefined();
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
  });

  it('should return 400 for a username with invalid characters', async () => {
    const request = createRequest({ username: 'bad user!', confirmUsername: 'bad user!' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid username format');
    expect(data.details).toBeDefined();
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
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
    expect(mockPrismaUpdate).not.toHaveBeenCalled();
  });

  it('should return 200 with available:false when username is taken (P2002)', async () => {
    mockPrismaUpdate.mockRejectedValue(
      new PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      })
    );

    const request = createRequest({ username: 'takenuser', confirmUsername: 'takenuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.available).toBe(false);
    expect(data.error).toBe('This username is not available. Please choose another.');
  });

  it('should return 500 when an unexpected error occurs during update', async () => {
    mockPrismaUpdate.mockRejectedValue(new Error('Database connection lost'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('An error occurred while updating the username');

    consoleErrorSpy.mockRestore();
  });

  it('should log full error in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockPrismaUpdate.mockRejectedValue(new Error('Dev debug error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error updating username:', expect.any(Error));

    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('should log "Unknown error" when thrown value is not an Error instance', async () => {
    mockPrismaUpdate.mockRejectedValue('a plain string error');

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = createRequest({ username: 'validuser', confirmUsername: 'validuser' });
    const response = await POST(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error updating username:', 'Unknown error');

    consoleErrorSpy.mockRestore();
  });

  it('should accept a valid username with underscores and dashes', async () => {
    mockPrismaUpdate.mockResolvedValue({
      id: 'user-123',
      username: 'my_user-name99',
    });

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
