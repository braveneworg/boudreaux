import { NextRequest } from 'next/server';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { vi } from 'vitest';

import { POST } from './route';

import { prisma } from '@/app/lib/prisma';

// Mock dependencies
vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
  },
}));

vi.mock('@/app/lib/decorators/with-auth', () => ({
  withAuth: (handler: any) => handler,
}));

describe('POST /api/user/username', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful username update', () => {
    it('should update username when data is valid', async () => {
      const mockUpdate = vi.mocked(prisma.user.update);
      mockUpdate.mockResolvedValue({
        id: 'user-123',
        username: 'newusername',
      } as any);

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'newusername',
          confirmUsername: 'newusername',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.username).toBe('newusername');
      expect(data.message).toBe('Username updated successfully');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { username: 'newusername' },
      });
    });

    it('should return available:true on success', async () => {
      const mockUpdate = vi.mocked(prisma.user.update);
      mockUpdate.mockResolvedValue({
        id: 'user-123',
        username: 'validname',
      } as any);

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'validname',
          confirmUsername: 'validname',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(data.available).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('should return 400 when username format is invalid', async () => {
      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'a', // Too short (min is 2)
          confirmUsername: 'a',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid username format');
      expect(data.details).toBeDefined();
    });

    it('should return 400 when usernames do not match', async () => {
      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'validusername',
          confirmUsername: 'differentname',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid username format');
    });

    it('should return 400 when username contains invalid characters', async () => {
      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'invalid@username',
          confirmUsername: 'invalid@username',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid username format');
    });
  });

  describe('duplicate username handling', () => {
    it('should return available:false when username is taken', async () => {
      const mockUpdate = vi.mocked(prisma.user.update);
      const duplicateError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockUpdate.mockRejectedValue(duplicateError);

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'takenname',
          confirmUsername: 'takenname',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(200); // Returns 200 to prevent enumeration
      expect(data.available).toBe(false);
      expect(data.error).toBe('This username is not available. Please choose another.');
    });

    it('should not expose success flag when username is taken', async () => {
      const mockUpdate = vi.mocked(prisma.user.update);
      const duplicateError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockUpdate.mockRejectedValue(duplicateError);

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'takenname',
          confirmUsername: 'takenname',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(data.success).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return 500 on unexpected database error', async () => {
      const mockUpdate = vi.mocked(prisma.user.update);
      mockUpdate.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'validname',
          confirmUsername: 'validname',
        }),
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('An error occurred while updating the username');
    });

    it('should handle JSON parse errors', async () => {
      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request, {}, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('An error occurred while updating the username');
    });

    it('should log error details in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockUpdate = vi.mocked(prisma.user.update);
      mockUpdate.mockRejectedValue(new Error('Test error'));

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'validname',
          confirmUsername: 'validname',
        }),
      });

      await POST(request, {}, mockSession);

      expect(consoleSpy).toHaveBeenCalledWith('Error updating username:', expect.any(Error));

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should log only error message in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockUpdate = vi.mocked(prisma.user.update);
      mockUpdate.mockRejectedValue(new Error('Test error message'));

      const request = new NextRequest('http://localhost/api/user/username', {
        method: 'POST',
        body: JSON.stringify({
          username: 'validname',
          confirmUsername: 'validname',
        }),
      });

      await POST(request, {}, mockSession);

      expect(consoleSpy).toHaveBeenCalledWith('Error updating username:', 'Test error message');

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
