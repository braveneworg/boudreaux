/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getToken } from 'next-auth/jwt';

import { proxy, config } from './proxy';

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(() => ({ type: 'next' })),
    redirect: vi.fn((url: URL) => ({ type: 'redirect', url: url.toString() })),
    json: vi.fn((data: unknown, options?: { status?: number }) => ({
      type: 'json',
      data,
      status: options?.status,
    })),
  },
}));

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

interface MockNextUrl {
  pathname: string;
  searchParams: URLSearchParams;
}

type MockHeaders = {
  get: (key: string) => string | null;
};

interface MockNextRequest {
  nextUrl: MockNextUrl;
  url: string;
  headers: MockHeaders;
}

function createMockRequest(
  pathname: string,
  callbackUrl: string | null = null,
  headers: Record<string, string> = {}
): MockNextRequest {
  const searchParams = new URLSearchParams();
  if (callbackUrl) {
    searchParams.set('callbackUrl', callbackUrl);
  }

  return {
    nextUrl: {
      pathname,
      searchParams,
    },
    url: `http://localhost:3000${pathname}`,
    headers: {
      get: (key: string) => headers[key] || null,
    },
  };
}

describe('proxy middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('public routes', () => {
    it('allows access to root path without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signin page without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/signin');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signin sub-routes without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/signin/callback');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signup page without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/signup');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signout page without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/signout');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to success routes without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/success/registration');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to api/auth routes without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/api/auth/session');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to health check endpoint without authentication', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/api/health');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('private routes', () => {
    it('redirects unauthenticated users from profile to signin', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/profile');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/profile');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('redirects unauthenticated users from profile sub-routes to signin', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/profile/settings');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/profile/settings');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('allows authenticated users to access profile', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/profile');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('callback URL handling', () => {
    it('redirects authenticated users to callbackUrl when provided', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/some-page', '/dashboard');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/dashboard');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('does not redirect when callbackUrl matches current pathname', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/dashboard', '/dashboard');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('does not redirect unauthenticated users with callbackUrl on public routes', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/signin', '/dashboard');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('admin routes', () => {
    it('redirects unauthenticated users from admin to signin', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/admin');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('redirects unauthenticated users from admin sub-routes to signin', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/admin/users');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('returns 403 for non-admin users accessing admin routes', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/admin');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.json).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
      expect(result).toMatchObject({ type: 'json', status: 403 });
    });

    it('logs unauthorized admin access attempts', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/admin/dashboard', null, {
        'x-forwarded-for': '192.168.1.1',
      });

      await proxy(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          userId: 'user-123',
          attemptedPath: '/admin/dashboard',
          userRole: 'user',
          ip: '192.168.1.1',
        })
      );
    });

    it('logs unauthorized access with x-real-ip header', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/admin', null, {
        'x-real-ip': '10.0.0.1',
      });

      await proxy(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          ip: '10.0.0.1',
        })
      );
    });

    it('logs unauthorized access with null IP when no headers present', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/admin');

      await proxy(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          ip: null,
        })
      );
    });

    it('logs unauthorized access with "none" role when user has no role', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: {},
      });
      const request = createMockRequest('/admin');

      await proxy(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          userRole: 'none',
        })
      );
    });

    it('allows admin users to access admin routes', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'admin-123',
        user: { role: 'admin' },
      });
      const request = createMockRequest('/admin');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows admin users to access admin sub-routes', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'admin-123',
        user: { role: 'admin' },
      });
      const request = createMockRequest('/admin/users/edit');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('unauthenticated routes (non-public, non-private)', () => {
    it('redirects unauthenticated users to signin for non-public routes', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/dashboard');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/dashboard');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('allows authenticated users to access general routes', async () => {
      vi.mocked(getToken).mockResolvedValue({
        sub: 'user-123',
        user: { role: 'user' },
      });
      const request = createMockRequest('/dashboard');

      const result = await proxy(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('token retrieval', () => {
    it('uses production cookie name in production environment', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/');

      await proxy(request as unknown as NextRequest);

      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: '__Secure-next-auth.session-token',
        })
      );

      vi.unstubAllEnvs();
    });

    it('uses development cookie name in non-production environment', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/');

      await proxy(request as unknown as NextRequest);

      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({
          cookieName: 'next-auth.session-token',
        })
      );
    });

    it('passes AUTH_SECRET to getToken', async () => {
      const originalSecret = process.env.AUTH_SECRET;
      process.env.AUTH_SECRET = 'test-secret';

      vi.mocked(getToken).mockResolvedValue(null);
      const request = createMockRequest('/');

      await proxy(request as unknown as NextRequest);

      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({
          secret: 'test-secret',
        })
      );

      process.env.AUTH_SECRET = originalSecret;
    });
  });
});

describe('proxy config', () => {
  it('exports matcher configuration for protected routes', () => {
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();
    expect(config.matcher).toContain('/profile');
    expect(config.matcher).toContain('/profile/:path*');
    expect(config.matcher).toContain('/admin');
    expect(config.matcher).toContain('/admin/:path*');
    expect(config.matcher).toContain('/api/admin/:path*');
  });
});
