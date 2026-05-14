// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ChatService } from '@/lib/services/chat-service';

import { GET } from './route';

const mockSession = {
  user: { id: 'user-1', email: 'octo@example.com', name: 'Octo', role: 'user' },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, session: unknown) => Promise<Response>) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx, mockSession),
}));

vi.mock('@/lib/services/chat-service', () => ({
  ChatService: { listRecent: vi.fn() },
}));

const buildRequest = (search = '') =>
  new NextRequest(`http://localhost:3000/api/chat/messages${search}`);

beforeEach(() => vi.clearAllMocks());

describe('GET /api/chat/messages', () => {
  it('returns messages from the service with the default limit', async () => {
    vi.mocked(ChatService.listRecent).mockResolvedValue([{ id: 'msg-1' }] as never);

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(ChatService.listRecent).toHaveBeenCalledWith({ limit: 20, cursor: undefined });
    expect(response.status).toBe(200);
    expect(body.messages).toEqual([{ id: 'msg-1' }]);
  });

  it('respects an explicit limit and clamps to the max', async () => {
    vi.mocked(ChatService.listRecent).mockResolvedValue([] as never);

    await GET(buildRequest('?limit=500'), { params: Promise.resolve({}) });

    expect(ChatService.listRecent).toHaveBeenCalledWith({ limit: 50, cursor: undefined });
  });

  it('clamps a limit below 1 up to 1', async () => {
    vi.mocked(ChatService.listRecent).mockResolvedValue([] as never);

    await GET(buildRequest('?limit=0'), { params: Promise.resolve({}) });

    expect(ChatService.listRecent).toHaveBeenCalledWith({ limit: 1, cursor: undefined });
  });

  it('passes a parsed cursor through when both params are present', async () => {
    vi.mocked(ChatService.listRecent).mockResolvedValue([] as never);

    await GET(buildRequest(`?cursorCreatedAt=2026-05-01T12:00:00.000Z&cursorId=cursor-1`), {
      params: Promise.resolve({}),
    });

    expect(ChatService.listRecent).toHaveBeenCalledWith({
      limit: 20,
      cursor: { createdAt: new Date('2026-05-01T12:00:00.000Z'), id: 'cursor-1' },
    });
  });

  it('returns 400 for an unparseable cursorCreatedAt', async () => {
    const response = await GET(buildRequest('?cursorCreatedAt=not-a-date&cursorId=x'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(400);
    expect(ChatService.listRecent).not.toHaveBeenCalled();
  });

  it('ignores a half-cursor (only one of the pair is present)', async () => {
    vi.mocked(ChatService.listRecent).mockResolvedValue([] as never);

    await GET(buildRequest('?cursorCreatedAt=2026-05-01T12:00:00.000Z'), {
      params: Promise.resolve({}),
    });

    expect(ChatService.listRecent).toHaveBeenCalledWith({ limit: 20, cursor: undefined });
  });
});
