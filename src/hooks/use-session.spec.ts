/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useSession } from './use-session';

const betterAuthUseSession = vi.hoisted(() => vi.fn());
const betterAuthGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: betterAuthUseSession,
    getSession: betterAuthGetSession,
  },
}));

describe('useSession adapter', () => {
  beforeEach(() => {
    betterAuthUseSession.mockReset();
  });

  it("reports 'loading' while the better-auth session is pending", () => {
    betterAuthUseSession.mockReturnValue({ data: null, isPending: true });

    const { result } = renderHook(() => useSession());

    expect(result.current.status).toBe('loading');
  });

  it("reports 'unauthenticated' with null data when there is no session", () => {
    betterAuthUseSession.mockReturnValue({ data: null, isPending: false });

    const { result } = renderHook(() => useSession());

    expect(result.current.status).toBe('unauthenticated');
  });

  it('returns null data when there is no session', () => {
    betterAuthUseSession.mockReturnValue({ data: null, isPending: false });

    const { result } = renderHook(() => useSession());

    expect(result.current.data).toBeNull();
  });

  it("reports 'authenticated' when a session with a user resolves", () => {
    betterAuthUseSession.mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b.co', role: 'admin' }, session: { id: 's1' } },
      isPending: false,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.status).toBe('authenticated');
  });

  it('exposes the user under data.user', () => {
    betterAuthUseSession.mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b.co', role: 'admin' }, session: { id: 's1' } },
      isPending: false,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.data?.user).toEqual(expect.objectContaining({ id: 'u1', role: 'admin' }));
  });

  it('update() refetches the session bypassing the cookie cache', async () => {
    betterAuthUseSession.mockReturnValue({ data: null, isPending: false });
    betterAuthGetSession.mockResolvedValue({ data: null });

    const { result } = renderHook(() => useSession());
    await result.current.update();

    expect(betterAuthGetSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
  });
});
