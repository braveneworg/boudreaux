// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ChatAdminService } from '@/lib/services/chat-admin-service';

import { GET } from './route';

const mockAdminSession = {
  user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' },
};

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin:
    (handler: (req: unknown, ctx: unknown, session: unknown) => Promise<Response>) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx, mockAdminSession),
}));

vi.mock('@/lib/services/chat-admin-service', () => ({
  DEFAULT_PER_PAGE: 50,
  MAX_PER_PAGE: 100,
  ChatAdminService: { listChatUsers: vi.fn() },
}));

const buildRequest = (search = '') =>
  new NextRequest(`http://localhost:3000/api/admin/chat/users${search}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ChatAdminService.listChatUsers).mockResolvedValue({
    rows: [],
    total: 0,
    page: 1,
    perPage: 50,
  });
});

describe('GET /api/admin/chat/users', () => {
  it('uses sensible defaults when no query params are supplied', async () => {
    await GET(buildRequest(), { params: Promise.resolve({}) });

    expect(ChatAdminService.listChatUsers).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });
  });

  it('parses page and perPage params', async () => {
    await GET(buildRequest('?page=3&perPage=25'), { params: Promise.resolve({}) });

    expect(ChatAdminService.listChatUsers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, perPage: 25 })
    );
  });

  it('accepts the lastSeenAt sortBy option', async () => {
    await GET(buildRequest('?sortBy=lastSeenAt&sortDirection=asc'), {
      params: Promise.resolve({}),
    });

    expect(ChatAdminService.listChatUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'lastSeenAt', sortDirection: 'asc' })
    );
  });

  it('falls back to messageCount when sortBy is unknown', async () => {
    await GET(buildRequest('?sortBy=bogus'), { params: Promise.resolve({}) });

    expect(ChatAdminService.listChatUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'messageCount' })
    );
  });

  it('forces sortDirection to desc unless explicitly asc', async () => {
    await GET(buildRequest('?sortDirection=sideways'), { params: Promise.resolve({}) });

    expect(ChatAdminService.listChatUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sortDirection: 'desc' })
    );
  });

  it('returns the service result as JSON', async () => {
    const result = { rows: [{ id: 'cu-1' }], total: 1, page: 1, perPage: 50 };
    vi.mocked(ChatAdminService.listChatUsers).mockResolvedValue(result as never);

    const response = await GET(buildRequest(), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });
});
