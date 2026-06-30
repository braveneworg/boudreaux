// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// Mutable session holder — each test sets this to control the session shape.
const currentSession = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    banned: null as boolean | null,
    role: 'user',
  },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, session: unknown) => Promise<Response>) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx, currentSession),
}));

const findByUserIdMock = vi.hoisted(() => vi.fn());
const banEvasionCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: {
    findByUserId: findByUserIdMock,
  },
}));

vi.mock('@/lib/services/ban-evasion-service', () => ({
  BanEvasionService: {
    check: banEvasionCheckMock,
  },
}));

vi.mock('@/lib/utils/extract-client-ip', () => ({
  extractClientIp: () => '203.0.113.5',
}));

const buildRequest = () =>
  new NextRequest('http://localhost:3000/api/chat/me', {
    headers: { 'user-agent': 'test-ua', 'accept-language': 'en-US' },
  });

describe('GET /api/chat/me', () => {
  beforeEach(() => {
    // Reset to a clean, not-banned user with no chat-user record.
    currentSession.user.banned = null;
    findByUserIdMock.mockResolvedValue(null);
    banEvasionCheckMock.mockResolvedValue({ banned: false });
  });

  it('returns blocked: false for a clean user with no bans', async () => {
    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body).toEqual({ blocked: false });
  });

  it('returns blocked: true when ChatUser.disabled is set', async () => {
    findByUserIdMock.mockResolvedValue({ disabled: true });

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body).toEqual({ blocked: true });
  });

  it('returns blocked: true when the fingerprint/evasion ban check fires', async () => {
    banEvasionCheckMock.mockResolvedValue({ banned: true });

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body).toEqual({ blocked: true });
  });

  it('returns blocked: true when the user has an account ban (banned: true)', async () => {
    currentSession.user.banned = true;

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body).toEqual({ blocked: true });
  });

  it('returns blocked: false when banned is null (no account ban applied)', async () => {
    currentSession.user.banned = null;

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body).toEqual({ blocked: false });
  });
});
