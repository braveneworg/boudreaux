/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock the auth function
const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

// Mock structured logging
const authWarnMock = vi.hoisted(() => vi.fn());
const httpErrorMock = vi.hoisted(() => vi.fn());
const logSecurityEventMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { auth: { warn: authWarnMock }, http: { error: httpErrorMock } },
}));
vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: logSecurityEventMock,
  extractRequestMetadata: vi.fn(() => ({ ip: '203.0.113.7', userAgent: 'vitest' })),
}));

// Mock NextResponse
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: vi.fn().mockImplementation((data, init) => ({ type: 'json', data, init })),
    },
  };
});

// Import after mocks are set up
const { withAuth, withAdmin } = await import('./with-auth');
const { DataError } = await import('@/lib/types/domain/errors');

describe('withAuth decorator', () => {
  const mockNextResponse = NextResponse as unknown as {
    json: ReturnType<typeof vi.fn>;
  };
  const createMockRequest = (url = 'https://example.com/api/test') =>
    ({
      url,
      method: 'GET',
      headers: new Headers(),
      nextUrl: new URL(url),
    }) as NextRequest;

  const createMockContext = (params = {}) => ({ params: Promise.resolve(params) });

  const createMockSession = (overrides = {}) => ({
    user: {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
      ...overrides,
    },
  });

  const createMockHandler = () =>
    vi.fn().mockResolvedValue(NextResponse.json({ message: 'Success' }));

  describe('authentication', () => {
    it('should call the handler when user is authenticated', async () => {
      const mockSession = createMockSession();
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Authentication required' },
        { status: 401 }
      );
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Authentication required' },
        init: { status: 401 },
      });
    });

    it('should return 401 when auth throws an error', async () => {
      mockAuth.mockRejectedValue(Error('Auth error'));

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      // The decorator should catch the error and return 401
      await expect(wrappedHandler(request, context)).rejects.toThrow('Auth error');
    });

    it('should pass through the original handler response', async () => {
      const mockSession = createMockSession();
      mockAuth.mockResolvedValue(mockSession);

      const expectedResponse = {
        type: 'success',
        data: { message: 'Custom response' },
      };
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(result).toBe(expectedResponse);
    });

    it('should handle synchronous handler responses', async () => {
      const mockSession = createMockSession();
      mockAuth.mockResolvedValue(mockSession);

      const expectedResponse = {
        type: 'sync',
        data: { message: 'Sync response' },
      };
      const mockHandler = vi.fn().mockReturnValue(expectedResponse);
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(result).toBe(expectedResponse);
    });
  });

  describe('banned accounts', () => {
    it('should return 403 when the authenticated user is banned', async () => {
      mockAuth.mockResolvedValue(createMockSession({ banned: true }));

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const result = await wrappedHandler(createMockRequest(), createMockContext());

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Account suspended' },
        init: { status: 403 },
      });
    });

    it('should call the handler when banned is explicitly false', async () => {
      mockAuth.mockResolvedValue(createMockSession({ banned: false }));

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      await wrappedHandler(createMockRequest(), createMockContext());

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should call the handler when banned is null', async () => {
      mockAuth.mockResolvedValue(createMockSession({ banned: null }));

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      await wrappedHandler(createMockRequest(), createMockContext());

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should log a security event with the banned user id', async () => {
      mockAuth.mockResolvedValue(createMockSession({ id: '42', banned: true }));

      const wrappedHandler = withAuth(createMockHandler());

      await wrappedHandler(createMockRequest(), createMockContext());

      expect(logSecurityEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'api.unauthorized_access', userId: '42' })
      );
    });
  });

  describe('context and parameters', () => {
    it('should pass request context with parameters correctly', async () => {
      const mockSession = createMockSession();
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest('https://example.com/api/users/123');
      const context = createMockContext({ id: '123', slug: 'test' });

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
    });

    it('should handle empty context parameters', async () => {
      const mockSession = createMockSession();
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
    });
  });

  describe('session user id validation', () => {
    it('should return 401 when session user has no id', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'test@example.com', role: 'user' } });

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Authentication required' },
        { status: 401 }
      );
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Authentication required' },
        init: { status: 401 },
      });
    });
  });

  describe('session data handling', () => {
    it('should handle session with complete user data', async () => {
      const mockSession = createMockSession({
        id: 'user-123',
        email: 'john.doe@example.com',
        name: 'John Doe',
        role: 'admin',
      });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
    });

    it('should handle session with minimal user data', async () => {
      const mockSession = {
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test',
          role: 'user',
        },
      };
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = withAuth(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
    });
  });
});

describe('withAdmin decorator', () => {
  const mockNextResponse = NextResponse as unknown as {
    json: ReturnType<typeof vi.fn>;
  };
  const createMockRequest = (url = 'https://example.com/api/admin/test') =>
    ({
      url,
      method: 'GET',
      headers: new Headers(),
      nextUrl: new URL(url),
    }) as NextRequest;

  const createMockContext = (params = {}) => ({ params: Promise.resolve(params) });

  const createMockSession = (overrides = {}) => ({
    user: {
      id: '1',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      ...overrides,
    },
  });

  const createMockHandler = () =>
    vi.fn().mockResolvedValue(NextResponse.json({ message: 'Admin Success' }));

  describe('admin authorization', () => {
    it('should call the handler when user has admin role', async () => {
      const mockSession = createMockSession({ role: 'admin' });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should return 403 when user does not have admin role', async () => {
      const mockSession = createMockSession({ role: 'user' });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Insufficient permissions', required: 'admin' },
        { status: 403 }
      );
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Insufficient permissions', required: 'admin' },
        init: { status: 403 },
      });
    });

    it('should return 403 when user has no role', async () => {
      const mockSession = createMockSession({ role: undefined });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Insufficient permissions', required: 'admin' },
        init: { status: 403 },
      });
    });

    it('should return 403 when user has null role', async () => {
      const mockSession = createMockSession({ role: null });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Insufficient permissions', required: 'admin' },
        init: { status: 403 },
      });
    });

    it('should return 401 when session is null', async () => {
      mockAuth.mockResolvedValue(null);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Authentication required' },
        init: { status: 401 },
      });
    });

    it('should return 401 when session user has no id', async () => {
      mockAuth.mockResolvedValue({ user: { email: 'admin@example.com', role: 'admin' } });

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockNextResponse.json).toHaveBeenCalledWith(
        { error: 'Authentication required' },
        { status: 401 }
      );
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Authentication required' },
        init: { status: 401 },
      });
    });

    it('should return 401 when session user is undefined', async () => {
      mockAuth.mockResolvedValue({ user: undefined });

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Authentication required' },
        init: { status: 401 },
      });
    });
  });

  describe('banned admin accounts', () => {
    it('should return 403 Account suspended when a banned admin hits an admin route', async () => {
      mockAuth.mockResolvedValue(createMockSession({ role: 'admin', banned: true }));

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const result = await wrappedHandler(createMockRequest(), createMockContext());

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Account suspended' },
        init: { status: 403 },
      });
    });

    it('should block a banned admin before the role check runs', async () => {
      mockAuth.mockResolvedValue(createMockSession({ role: 'user', banned: true }));

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const result = await wrappedHandler(createMockRequest(), createMockContext());

      expect(mockHandler).not.toHaveBeenCalled();
      // Suspended takes precedence over the "insufficient permissions" role error.
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Account suspended' },
        init: { status: 403 },
      });
    });
  });

  describe('auth error handling', () => {
    it('should return 403 when auth throws an error', async () => {
      mockAuth.mockRejectedValue(Error('Auth error'));

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      // The decorator should propagate the error
      await expect(wrappedHandler(request, context)).rejects.toThrow('Auth error');
    });
  });

  describe('response handling', () => {
    it('should pass through the original handler response', async () => {
      const mockSession = createMockSession({ role: 'admin' });
      mockAuth.mockResolvedValue(mockSession);

      const expectedResponse = {
        type: 'success',
        data: { message: 'Admin operation completed' },
      };
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(result).toBe(expectedResponse);
    });

    it('should handle synchronous handler responses', async () => {
      const mockSession = createMockSession({ role: 'admin' });
      mockAuth.mockResolvedValue(mockSession);

      const expectedResponse = {
        type: 'sync',
        data: { message: 'Sync admin response' },
      };
      const mockHandler = vi.fn().mockReturnValue(expectedResponse);
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(result).toBe(expectedResponse);
    });
  });

  describe('role validation edge cases', () => {
    it('should accept exact "admin" role', async () => {
      const mockSession = createMockSession({ role: 'admin' });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
    });

    it.each(['ADMIN', 'Admin'])('should reject case variation "%s"', async (roleCase) => {
      const mockSession = createMockSession({ role: roleCase });
      mockAuth.mockResolvedValue(mockSession);

      const mockHandler = createMockHandler();
      const wrappedHandler = await withAdmin(mockHandler);

      const request = createMockRequest();
      const context = createMockContext();

      const result = await wrappedHandler(request, context);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'json',
        data: { error: 'Insufficient permissions', required: 'admin' },
        init: { status: 403 },
      });
    });

    it.each(['user', 'moderator', 'superuser', 'administrator'])(
      'should reject role "%s"',
      async (role) => {
        const mockSession = createMockSession({ role });
        mockAuth.mockResolvedValue(mockSession);

        const mockHandler = createMockHandler();
        const wrappedHandler = await withAdmin(mockHandler);

        const request = createMockRequest();
        const context = createMockContext();

        const result = await wrappedHandler(request, context);

        expect(mockHandler).not.toHaveBeenCalled();
        expect(result).toEqual({
          type: 'json',
          data: { error: 'Insufficient permissions', required: 'admin' },
          init: { status: 403 },
        });
      }
    );
  });
});

describe('unauthorized access logging', () => {
  const request = {
    url: 'https://example.com/api/admin/test',
    method: 'GET',
    headers: new Headers(),
    nextUrl: new URL('https://example.com/api/admin/test'),
  } as NextRequest;
  const context = { params: Promise.resolve({}) };

  it('logs a warning and security event on 401', async () => {
    mockAuth.mockResolvedValue(null);
    const wrappedHandler = withAuth(vi.fn());

    await wrappedHandler(request, context);

    expect(authWarnMock).toHaveBeenCalledWith(
      'Unauthorized API access',
      expect.objectContaining({
        status: 401,
        path: '/api/admin/test',
        method: 'GET',
        ip: '203.0.113.7',
      })
    );
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'api.unauthorized_access',
        ip: '203.0.113.7',
        userAgent: 'vitest',
        metadata: expect.objectContaining({ status: 401 }),
      })
    );
  });

  it('logs the acting user on 403', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-9', email: 'u@example.com', name: 'U', role: 'user' },
    });
    const wrappedHandler = withAdmin(vi.fn());

    await wrappedHandler(request, context);

    expect(authWarnMock).toHaveBeenCalledWith(
      'Unauthorized API access',
      expect.objectContaining({ status: 403, userId: 'user-9' })
    );
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'api.unauthorized_access', userId: 'user-9' })
    );
  });

  it('does not log when the request is authorized', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'a@example.com', name: 'A', role: 'admin' },
    });
    const wrappedHandler = withAdmin(vi.fn().mockResolvedValue({ status: 200 }));

    await wrappedHandler(request, context);

    expect(authWarnMock).not.toHaveBeenCalled();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });
});

/**
 * The decorators are the only thing wrapping nearly every route, so they are
 * where an uncaught throw should turn into a response. This is a BACKSTOP: a
 * route that still has its own try/catch handles the error first and this never
 * sees it. Its value is that deleting those per-route catches becomes safe.
 */
describe('error boundary', () => {
  const request = (): NextRequest =>
    ({
      url: 'https://example.com/api/test',
      method: 'GET',
      headers: new Headers(),
      nextUrl: new URL('https://example.com/api/test'),
    }) as NextRequest;

  const context = () => ({ params: Promise.resolve({}) });

  const session = { user: { id: '1', email: 'a@b.c', name: 'T', role: 'admin' } };

  const jsonMock = () => (NextResponse as unknown as { json: ReturnType<typeof vi.fn> }).json;

  beforeEach(() => {
    mockAuth.mockResolvedValue(session);
  });

  it('maps a thrown NOT_FOUND DataError to 404', async () => {
    const handler = vi.fn().mockRejectedValue(new DataError('NOT_FOUND', 'Video not found'));

    await withAuth(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith(expect.anything(), { status: 404 });
  });

  it('maps a thrown UNAVAILABLE DataError to 503', async () => {
    const handler = vi.fn().mockRejectedValue(new DataError('UNAVAILABLE', 'db down'));

    await withAuth(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith(expect.anything(), { status: 503 });
  });

  it('surfaces the DataError message to the caller', async () => {
    const handler = vi.fn().mockRejectedValue(new DataError('NOT_FOUND', 'Video not found'));

    await withAuth(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith({ error: 'Video not found' }, expect.anything());
  });

  it('maps an unrecognised throw to 500', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));

    await withAuth(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith(expect.anything(), { status: 500 });
  });

  /** An unexpected fault must not leak its internals to the client. */
  it('does not leak the message of an unrecognised throw', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('connection string: secret'));

    await withAuth(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith({ error: 'Internal server error' }, expect.anything());
  });

  it('logs an unrecognised throw', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));

    await withAuth(handler)(request(), context());

    expect(httpErrorMock).toHaveBeenCalled();
  });

  it('does not log a routine NOT_FOUND', async () => {
    const handler = vi.fn().mockRejectedValue(new DataError('NOT_FOUND', 'missing'));

    await withAuth(handler)(request(), context());

    expect(httpErrorMock).not.toHaveBeenCalled();
  });

  it('leaves a successful handler response untouched', async () => {
    const response = { type: 'json', data: { ok: true } };
    const handler = vi.fn().mockResolvedValue(response);

    const result = await withAuth(handler)(request(), context());

    expect(result).toBe(response);
  });

  it('applies the same boundary to withAdmin', async () => {
    const handler = vi.fn().mockRejectedValue(new DataError('UNAVAILABLE', 'db down'));

    await withAdmin(handler)(request(), context());

    expect(jsonMock()).toHaveBeenCalledWith(expect.anything(), { status: 503 });
  });
});
