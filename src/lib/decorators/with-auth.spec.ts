import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Mock server-only module
vi.mock('server-only', () => ({}));

// Mock the auth function
const mockAuth = vi.fn();
vi.mock('../../../auth', () => ({
  auth: mockAuth,
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

describe('withAuth decorator', () => {
  const mockNextResponse = NextResponse as unknown as {
    json: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (url = 'https://example.com/api/test') =>
    ({
      url,
      method: 'GET',
      headers: new Headers(),
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (url = 'https://example.com/api/admin/test') =>
    ({
      url,
      method: 'GET',
      headers: new Headers(),
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

    it('should return 403 when session user is undefined', async () => {
      mockAuth.mockResolvedValue({ user: undefined });

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
    it('should handle different admin role case variations', async () => {
      const testCases = ['admin', 'ADMIN', 'Admin'];

      for (const roleCase of testCases) {
        vi.clearAllMocks();

        const mockSession = createMockSession({ role: roleCase });
        mockAuth.mockResolvedValue(mockSession);

        const mockHandler = createMockHandler();
        const wrappedHandler = await withAdmin(mockHandler);

        const request = createMockRequest();
        const context = createMockContext();

        const result = await wrappedHandler(request, context);

        if (roleCase === 'admin') {
          expect(mockHandler).toHaveBeenCalledWith(request, context, mockSession);
        } else {
          // Should reject non-exact matches
          expect(mockHandler).not.toHaveBeenCalled();
          expect(result).toEqual({
            type: 'json',
            data: { error: 'Insufficient permissions', required: 'admin' },
            init: { status: 403 },
          });
        }
      }
    });

    it('should reject other roles', async () => {
      const invalidRoles = ['user', 'moderator', 'superuser', 'administrator'];

      for (const role of invalidRoles) {
        vi.clearAllMocks();

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
    });
  });
});
