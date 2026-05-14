/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';

import { ChatAdminService, MAX_PER_PAGE } from './chat-admin-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: {
    findManyPaginated: vi.fn(),
    count: vi.fn(),
    setDisabled: vi.fn(),
    setFlagged: vi.fn(),
  },
}));

const sampleRow = {
  id: 'cu-1',
  userId: 'user-1',
  user: { id: 'user-1', username: 'octo', email: 'octo@example.com' },
  fingerprint: 'fp-abc',
  ipAddress: '203.0.113.5',
  messageCount: 12,
  flagged: false,
  disabled: false,
  lastSeenAt: new Date('2026-05-01T12:00:00Z'),
  createdAt: new Date('2026-04-01T12:00:00Z'),
};

describe('ChatAdminService.listChatUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a paginated, shaped result with username/email joined', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([sampleRow] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(1);

    const result = await ChatAdminService.listChatUsers({
      page: 1,
      perPage: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith({
      skip: 0,
      take: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });
    expect(result.rows[0].username).toBe('octo');
    expect(result.rows[0].email).toBe('octo@example.com');
    expect(result.total).toBe(1);
  });

  it('computes skip from the requested page and perPage', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(120);

    await ChatAdminService.listChatUsers({
      page: 3,
      perPage: 50,
      sortBy: 'lastSeenAt',
      sortDirection: 'asc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 })
    );
  });

  it('clamps perPage to MAX_PER_PAGE', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(0);

    await ChatAdminService.listChatUsers({
      page: 1,
      perPage: MAX_PER_PAGE + 500,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_PER_PAGE })
    );
  });

  it('clamps page to a minimum of 1', async () => {
    vi.mocked(ChatUserRepository.findManyPaginated).mockResolvedValue([] as never);
    vi.mocked(ChatUserRepository.count).mockResolvedValue(0);

    const result = await ChatAdminService.listChatUsers({
      page: 0,
      perPage: 50,
      sortBy: 'messageCount',
      sortDirection: 'desc',
    });

    expect(result.page).toBe(1);
    expect(ChatUserRepository.findManyPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });
});

describe('ChatAdminService.setDisabled', () => {
  it('delegates to the repository with the parent userId', async () => {
    vi.mocked(ChatUserRepository.setDisabled).mockResolvedValue({} as never);

    await ChatAdminService.setDisabled('user-1', true);

    expect(ChatUserRepository.setDisabled).toHaveBeenCalledWith('user-1', true);
  });
});

describe('ChatAdminService.clearFlag', () => {
  it('clears the abuse flag for the given userId', async () => {
    vi.mocked(ChatUserRepository.setFlagged).mockResolvedValue({} as never);

    await ChatAdminService.clearFlag('user-1');

    expect(ChatUserRepository.setFlagged).toHaveBeenCalledWith('user-1', false);
  });
});
