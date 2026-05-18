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
  ChatService: { listPinned: vi.fn() },
}));

const buildRequest = () => new NextRequest('http://localhost:3000/api/chat/pinned');

beforeEach(() => vi.clearAllMocks());

describe('GET /api/chat/pinned', () => {
  it('returns the pinned messages from the service', async () => {
    vi.mocked(ChatService.listPinned).mockResolvedValue([
      { id: 'msg-1', pinnedAt: '2026-05-02T10:00:00.000Z' },
    ] as never);

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(ChatService.listPinned).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(body.messages).toEqual([{ id: 'msg-1', pinnedAt: '2026-05-02T10:00:00.000Z' }]);
  });

  it('returns an empty list when nothing is pinned', async () => {
    vi.mocked(ChatService.listPinned).mockResolvedValue([]);

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(body.messages).toEqual([]);
  });
});
