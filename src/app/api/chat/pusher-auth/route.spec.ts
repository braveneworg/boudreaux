// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { CHAT_CHANNEL, getPusherServer } from '@/lib/utils/pusher-server';

import { POST } from './route';

const mockSession = {
  user: {
    id: 'user-1',
    email: 'octo@example.com',
    name: 'Octo',
    role: 'user',
  },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, session: unknown) => Promise<Response>) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx, mockSession),
}));

vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: { findByUserId: vi.fn() },
}));

const limiterCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  pollingLimiter: { check: limiterCheckMock },
  POLLING_LIMIT: 20,
}));

const authorizeChannelMock = vi.fn();

vi.mock('@/lib/utils/pusher-server', () => ({
  CHAT_CHANNEL: 'presence-fake-four-chat',
  getPusherServer: vi.fn(() => ({ authorizeChannel: authorizeChannelMock })),
}));

const buildRequest = (entries: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.append(key, value);
  return new NextRequest('http://localhost:3000/api/chat/pusher-auth', {
    method: 'POST',
    body: form,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue(null);
  authorizeChannelMock.mockReturnValue({ auth: 'signed' });
  limiterCheckMock.mockResolvedValue(undefined);
});

describe('POST /api/chat/pusher-auth', () => {
  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await POST(buildRequest({ socket_id: 'sock-1', channel_name: CHAT_CHANNEL }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(429);
    expect(authorizeChannelMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the ChatUser is disabled', async () => {
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue({
      disabled: true,
    } as never);

    const response = await POST(buildRequest({ socket_id: 'sock-1', channel_name: CHAT_CHANNEL }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(403);
    expect(authorizeChannelMock).not.toHaveBeenCalled();
  });

  it('returns 400 when socket_id is missing', async () => {
    const response = await POST(buildRequest({ channel_name: CHAT_CHANNEL }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(400);
  });

  it('returns 403 when subscribing to a non-chat channel', async () => {
    const response = await POST(
      buildRequest({ socket_id: 'sock-1', channel_name: 'private-other' }),
      { params: Promise.resolve({}) }
    );

    expect(response.status).toBe(403);
    expect(authorizeChannelMock).not.toHaveBeenCalled();
  });

  it('returns a signed presence payload with user_info on the happy path', async () => {
    const response = await POST(buildRequest({ socket_id: 'sock-1', channel_name: CHAT_CHANNEL }), {
      params: Promise.resolve({}),
    });

    expect(getPusherServer).toHaveBeenCalled();
    expect(authorizeChannelMock).toHaveBeenCalledWith(
      'sock-1',
      CHAT_CHANNEL,
      expect.objectContaining({
        user_id: 'user-1',
        user_info: expect.objectContaining({
          username: 'Octo',
          gravatarHash: expect.any(String),
        }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ auth: 'signed' });
  });
});
