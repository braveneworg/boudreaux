/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getCookieCache, getSessionCookie } from 'better-auth/cookies';

import type * as LegacySubmissionUrl from '@/lib/community/legacy-submission-url';
import type * as LegacyReleaseUrl from '@/lib/legacy-release-url';

import middleware, { config } from './proxy';

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

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
  getCookieCache: vi.fn(),
}));

const legacyReleaseResponse = vi.hoisted(() => vi.fn());
vi.mock('@/lib/legacy-release-url', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacyReleaseUrl>()),
  legacyReleaseResponse: (request: NextRequest, releaseId: string) =>
    legacyReleaseResponse(request, releaseId),
}));

const legacySubmissionResponse = vi.hoisted(() => vi.fn());
vi.mock('@/lib/community/legacy-submission-url', async (importOriginal) => ({
  ...(await importOriginal<typeof LegacySubmissionUrl>()),
  legacySubmissionResponse: (request: NextRequest, segment: string) =>
    legacySubmissionResponse(request, segment),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/release-service', () => ({ ReleaseService: {} }));

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

const createMockRequest = (
  pathname: string,
  callbackUrl: string | null = null,
  headers: Record<string, string> = {}
): MockNextRequest => {
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
      get: (key: string) => Object.entries(headers).find(([name]) => name === key)?.[1] || null,
    },
  };
};

/** Simulate a present (truthy) session cookie. */
const signedIn = (): void => {
  vi.mocked(getSessionCookie).mockReturnValue('signed-in-cookie-value');
};

/** Simulate no session cookie present. */
const signedOut = (): void => {
  vi.mocked(getSessionCookie).mockReturnValue(null);
};

type CachedSessionValue = Awaited<ReturnType<typeof getCookieCache>>;

/** Stub the optimistic role read from the cookie cache. */
const withCachedRole = (role: string | undefined): void => {
  // Only `user.role` is read by the middleware; cast past the full session shape.
  const value = (role === undefined ? { user: {} } : { user: { role } }) as unknown;
  vi.mocked(getCookieCache).mockResolvedValue(value as CachedSessionValue);
};

describe('proxy middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getCookieCache).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('public routes', () => {
    it('allows access to root path without authentication', async () => {
      signedOut();
      const request = createMockRequest('/');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signin page without authentication', async () => {
      signedOut();
      const request = createMockRequest('/signin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signin sub-routes without authentication', async () => {
      signedOut();
      const request = createMockRequest('/signin/callback');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signup page without authentication', async () => {
      signedOut();
      const request = createMockRequest('/signup');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to signout page without authentication', async () => {
      signedOut();
      const request = createMockRequest('/signout');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to success routes without authentication', async () => {
      signedOut();
      const request = createMockRequest('/success/registration');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to api/auth routes without authentication', async () => {
      signedOut();
      const request = createMockRequest('/api/auth/session');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows access to health check endpoint without authentication', async () => {
      signedOut();
      const request = createMockRequest('/api/health');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('private routes', () => {
    it('redirects unauthenticated users from profile to signin', async () => {
      signedOut();
      const request = createMockRequest('/profile');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/profile');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('redirects unauthenticated users from profile sub-routes to signin', async () => {
      signedOut();
      const request = createMockRequest('/profile/settings');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/profile/settings');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('allows authenticated users to access profile', async () => {
      signedIn();
      const request = createMockRequest('/profile');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows authenticated users to access profile sub-routes', async () => {
      signedIn();
      const request = createMockRequest('/profile/settings');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('callback URL handling', () => {
    it('redirects authenticated users to callbackUrl when provided', async () => {
      signedIn();
      const request = createMockRequest('/some-page', '/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/dashboard');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('does not redirect when callbackUrl matches current pathname', async () => {
      signedIn();
      const request = createMockRequest('/dashboard', '/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('does not redirect unauthenticated users with callbackUrl on public routes', async () => {
      signedOut();
      const request = createMockRequest('/signin', '/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    // ─── Security: open redirect prevention ───

    it('should redirect when callbackUrl is a valid same-origin path', async () => {
      signedIn();
      const request = createMockRequest('/some-page', '/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/dashboard');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('should NOT redirect when callbackUrl is an absolute URL', async () => {
      signedIn();
      const request = createMockRequest('/some-page', 'https://evil.com/steal');

      const result = await middleware(request as unknown as NextRequest);

      // Should NOT redirect to the external URL — should fall through to NextResponse.next()
      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('should NOT redirect when callbackUrl starts with // (protocol-relative URL)', async () => {
      signedIn();
      const request = createMockRequest('/some-page', '//evil.com/steal');

      const result = await middleware(request as unknown as NextRequest);

      // Protocol-relative URLs are blocked — should fall through to NextResponse.next()
      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('admin routes', () => {
    it('redirects unauthenticated users from admin to signin', async () => {
      signedOut();
      const request = createMockRequest('/admin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('redirects unauthenticated users from admin sub-routes to signin', async () => {
      signedOut();
      const request = createMockRequest('/admin/users');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('returns 403 for non-admin users accessing admin routes', async () => {
      signedIn();
      withCachedRole('user');
      const request = createMockRequest('/admin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.json).toHaveBeenCalledWith({ error: 'Forbidden' }, { status: 403 });
      expect(result).toMatchObject({ type: 'json', status: 403 });
    });

    it('logs unauthorized admin access attempts', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      signedIn();
      withCachedRole('user');
      const request = createMockRequest('/admin/dashboard', null, {
        'x-forwarded-for': '192.168.1.1',
      });

      await middleware(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          attemptedPath: '/admin/dashboard',
          userRole: 'user',
          ip: '192.168.1.1',
        })
      );
    });

    it('logs unauthorized access with x-real-ip header', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      signedIn();
      withCachedRole('user');
      const request = createMockRequest('/admin', null, {
        'x-real-ip': '10.0.0.1',
      });

      await middleware(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          ip: '10.0.0.1',
        })
      );
    });

    it('logs unauthorized access with null IP when no headers present', async () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      signedIn();
      withCachedRole('user');
      const request = createMockRequest('/admin');

      await middleware(request as unknown as NextRequest);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unauthorized admin access attempt:',
        expect.objectContaining({
          ip: null,
        })
      );
    });

    it('falls through (optimistic) when the cache yields no role', async () => {
      // Cache miss must not hard-deny a possibly-valid admin at the edge; the
      // authoritative withAdmin check decides server-side.
      signedIn();
      withCachedRole(undefined);
      const request = createMockRequest('/admin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('allows admin users to access admin routes', async () => {
      signedIn();
      withCachedRole('admin');
      const request = createMockRequest('/admin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it.each(['/admin/community', '/admin/community/507f1f77bcf86cd799439011'])(
      'allows a manager into the approver section at %s',
      async (path) => {
        signedIn();
        withCachedRole('manager');
        const request = createMockRequest(path);

        const result = await middleware(request as unknown as NextRequest);

        expect(result).toEqual({ type: 'next' });
      }
    );

    it.each(['/admin', '/admin/releases', '/admin/community-archive'])(
      'returns 403 for a manager at %s, outside the approver section',
      async (path) => {
        signedIn();
        withCachedRole('manager');
        const request = createMockRequest(path);

        const result = await middleware(request as unknown as NextRequest);

        expect(result).toMatchObject({ type: 'json', status: 403 });
      }
    );

    it('returns 403 for a plain user at the approver section', async () => {
      signedIn();
      withCachedRole('user');
      const request = createMockRequest('/admin/community');

      const result = await middleware(request as unknown as NextRequest);

      expect(result).toMatchObject({ type: 'json', status: 403 });
    });

    it('allows admin users to access admin sub-routes', async () => {
      signedIn();
      withCachedRole('admin');
      const request = createMockRequest('/admin/users/edit');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('falls through (optimistic) when the cookie cache cannot be read', async () => {
      // A null cache must not lock a real admin out at the edge.
      signedIn();
      vi.mocked(getCookieCache).mockResolvedValue(null);
      const request = createMockRequest('/admin');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('unauthenticated routes (non-public, non-private)', () => {
    it('redirects unauthenticated users to signin for non-public routes', async () => {
      signedOut();
      const request = createMockRequest('/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).toHaveBeenCalled();
      const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0][0] as URL;
      expect(redirectCall.pathname).toBe('/signin');
      expect(redirectCall.searchParams.get('callbackUrl')).toBe('/dashboard');
      expect(result).toMatchObject({ type: 'redirect' });
    });

    it('allows authenticated users to access general routes', async () => {
      signedIn();
      const request = createMockRequest('/dashboard');

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.next).toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });
  });

  describe('legacy release URL', () => {
    it('answers /releases/<id> from the legacy release URL, before any auth gate', async () => {
      signedOut();
      legacyReleaseResponse.mockResolvedValueOnce({ type: 'legacy-release' });
      const request = createMockRequest('/releases/0123456789abcdef01234567');

      const result = await middleware(request as unknown as NextRequest);

      expect(legacyReleaseResponse.mock.calls).toEqual([[request, '0123456789abcdef01234567']]);
      expect(result).toEqual({ type: 'legacy-release' });
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it('leaves other paths to the auth gates', async () => {
      signedOut();
      const request = createMockRequest('/releases/0123456789abcdef01234567/more');

      await middleware(request as unknown as NextRequest);

      expect(legacyReleaseResponse).not.toHaveBeenCalled();
    });
  });

  describe('the legacy submission URL', () => {
    const SUBMISSION_PATH = '/community/0123456789abcdef01234567';

    it('answers /community/<id> for a signed-out visitor before any auth gate', async () => {
      signedOut();
      legacySubmissionResponse.mockReturnValueOnce({ type: 'legacy-submission' });
      const request = createMockRequest(SUBMISSION_PATH);

      const result = await middleware(request as unknown as NextRequest);

      expect(legacySubmissionResponse.mock.calls).toEqual([[request, '0123456789abcdef01234567']]);
      expect(result).toEqual({ type: 'legacy-submission' });
      // The redirect is the legacy module's own; no auth gate made one.
      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it('answers a signed-in visitor the same way', async () => {
      signedIn();
      legacySubmissionResponse.mockReturnValueOnce({ type: 'legacy-submission' });
      const request = createMockRequest(SUBMISSION_PATH);

      const result = await middleware(request as unknown as NextRequest);

      expect(legacySubmissionResponse.mock.calls).toEqual([[request, '0123456789abcdef01234567']]);
      expect(result).toEqual({ type: 'legacy-submission' });
    });

    it('hands a signed-in visitor’s request for the form to the same answer', async () => {
      signedIn();
      legacySubmissionResponse.mockReturnValueOnce({ type: 'legacy-submission' });
      const request = createMockRequest('/community/submit');

      const result = await middleware(request as unknown as NextRequest);

      expect(legacySubmissionResponse.mock.calls).toEqual([[request, 'submit']]);
      expect(result).toEqual({ type: 'legacy-submission' });
    });

    it.each(['/community-archive/0123456789abcdef01234567', '/admin/community'])(
      'leaves a path that only shares the prefix alone (%s)',
      async (pathname) => {
        signedOut();
        const request = createMockRequest(pathname);

        await middleware(request as unknown as NextRequest);

        expect(legacySubmissionResponse).not.toHaveBeenCalled();
      }
    );
  });

  describe('the community pages that need an account', () => {
    const EDIT_PATH = '/community/0123456789abcdef01234567/edit';

    it.each(['/community/submit', '/community/mine', EDIT_PATH])(
      'sends a signed-out visitor from %s to sign in, and back afterwards',
      async (pathname) => {
        signedOut();
        const request = createMockRequest(pathname);

        const result = await middleware(request as unknown as NextRequest);

        const redirectCall = vi.mocked(NextResponse.redirect).mock.calls[0]?.[0] as URL;
        expect(redirectCall.pathname).toBe('/signin');
        expect(redirectCall.searchParams.get('callbackUrl')).toBe(pathname);
        expect(result).toMatchObject({ type: 'redirect' });
      }
    );

    it.each(['/community/submit', '/community/mine'])(
      'never takes %s for a legacy submission URL when the visitor is signed out',
      async (pathname) => {
        signedOut();
        const request = createMockRequest(pathname);

        await middleware(request as unknown as NextRequest);

        expect(legacySubmissionResponse).not.toHaveBeenCalled();
      }
    );

    it('lets a signed-in visitor through to a submission’s edit page', async () => {
      signedIn();
      const request = createMockRequest(EDIT_PATH);

      const result = await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).not.toHaveBeenCalled();
      expect(result).toEqual({ type: 'next' });
    });

    it('still answers a legacy submission URL for a signed-out visitor without sending them to sign in', async () => {
      signedOut();
      legacySubmissionResponse.mockReturnValueOnce({ type: 'legacy-submission' });
      const request = createMockRequest('/community/0123456789abcdef01234567');

      await middleware(request as unknown as NextRequest);

      expect(NextResponse.redirect).not.toHaveBeenCalled();
    });

    it.each(['/community/submitted', '/community/mines'])(
      'does not take %s for one of them',
      async (pathname) => {
        signedOut();
        legacySubmissionResponse.mockReturnValueOnce({ type: 'legacy-submission' });
        const request = createMockRequest(pathname);

        await middleware(request as unknown as NextRequest);

        expect(NextResponse.redirect).not.toHaveBeenCalled();
        expect(legacySubmissionResponse).toHaveBeenCalledTimes(1);
      }
    );
  });

  describe('session cookie presence', () => {
    it('reads the better-auth session cookie with the boudreaux prefix', async () => {
      signedOut();
      const request = createMockRequest('/');

      await middleware(request as unknown as NextRequest);

      expect(getSessionCookie).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ cookiePrefix: 'boudreaux' })
      );
    });

    it('reads the optimistic role from the cookie cache for admin routes', async () => {
      signedIn();
      withCachedRole('admin');
      const request = createMockRequest('/admin');

      await middleware(request as unknown as NextRequest);

      expect(getCookieCache).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ cookiePrefix: 'boudreaux' })
      );
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

  it('matches the legacy release URL, but not the public /releases listing', () => {
    expect(config.matcher).toContain('/releases/:releaseId');
    expect(config.matcher).not.toContain('/releases');
  });

  it('matches the legacy submission URL and an edit page, but not the community page', () => {
    expect(config.matcher).toContain('/community/:id');
    expect(config.matcher).toContain('/community/:id/edit');
    expect(config.matcher).not.toContain('/community');
    expect(config.matcher).not.toContain('/community/:path*');
  });

  it('excludes the public videos routes so the proxy never gates them', () => {
    expect(config.matcher).not.toContain('/videos');
    expect(config.matcher).not.toContain('/videos/:path*');
  });
});
