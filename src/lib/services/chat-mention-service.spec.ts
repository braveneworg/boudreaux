/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ChatMentionService } from './chat-mention-service';

vi.mock('server-only', () => ({}));

const mockFindMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: mockFindMany } },
}));

const mockSendChatMentionEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/email/send-chat-mention', () => ({
  sendChatMentionEmail: mockSendChatMentionEmail,
}));

const mockRedisSet = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockRedisRpush = vi.hoisted(() => vi.fn());
const mockRedisLrange = vi.hoisted(() => vi.fn());
const mockRedisExpire = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/upstash-redis', () => ({
  getRedisClient: () => ({
    set: mockRedisSet,
    del: mockRedisDel,
    rpush: mockRedisRpush,
    lrange: mockRedisLrange,
    expire: mockRedisExpire,
  }),
}));

const mockChatUserFindByUserId = vi.hoisted(() => vi.fn());
vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: { findByUserId: mockChatUserFindByUserId },
}));

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: mockLoggerInfo, error: mockLoggerError } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisLrange.mockResolvedValue([]);
  mockChatUserFindByUserId.mockResolvedValue(null);
});

describe('ChatMentionService.searchByPrefix', () => {
  it('returns an empty array for an empty/whitespace prefix', async () => {
    const out = await ChatMentionService.searchByPrefix('   ', 'me');
    expect(out).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('queries prisma with the trimmed prefix and excludes the caller', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: 'al-bert' },
    ]);

    const out = await ChatMentionService.searchByPrefix('  al  ', 'me');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { startsWith: 'al', mode: 'insensitive' },
          NOT: { id: 'me' },
        }),
        take: 8,
      })
    );
    expect(out).toEqual([
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: 'al-bert' },
    ]);
  });

  it('filters out rows with a null username', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: null },
    ]);

    const out = await ChatMentionService.searchByPrefix('a', 'me');
    expect(out).toEqual([{ id: 'u1', username: 'alice' }]);
  });
});

describe('ChatMentionService.resolveMentions', () => {
  it('returns an empty array when the body has no mentions', async () => {
    const out = await ChatMentionService.resolveMentions('hello world', 'author-1');
    expect(out).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('queries by the extracted usernames and returns matching users', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'u1', username: 'alice', email: 'alice@example.com' },
      { id: 'u2', username: 'bob', email: 'bob@example.com' },
    ]);

    const out = await ChatMentionService.resolveMentions('hi @alice and @bob', 'author-1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { in: ['alice', 'bob'], mode: 'insensitive' },
          NOT: { id: 'author-1' },
        }),
      })
    );
    expect(out).toEqual([
      { id: 'u1', username: 'alice', email: 'alice@example.com' },
      { id: 'u2', username: 'bob', email: 'bob@example.com' },
    ]);
  });

  it('drops rows missing username or email', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'u1', username: 'alice', email: 'a@x.com' },
      { id: 'u2', username: null, email: 'b@x.com' },
      { id: 'u3', username: 'bob', email: null },
    ]);

    const out = await ChatMentionService.resolveMentions('@alice @bob @nope', 'author-1');
    expect(out).toEqual([{ id: 'u1', username: 'alice', email: 'a@x.com' }]);
  });
});

describe('ChatMentionService.notifyMentions', () => {
  const baseParams = {
    authorId: 'author-1',
    authorUsername: 'author',
    messageBody: 'hey @recip',
    messageCreatedAt: '2026-05-18T12:00:00.000Z',
    recipients: [{ id: 'r1', username: 'recip', email: 'recip@example.com' }],
  };

  it('is a no-op when the recipient list is empty', async () => {
    await ChatMentionService.notifyMentions({ ...baseParams, recipients: [] });
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
  });

  it('claims the 1-hour throttle and emails a single mention when the slot is free', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockRedisSet).toHaveBeenCalledWith('chat:mention-throttle:r1', '1', {
      nx: true,
      ex: 60 * 60,
    });
    expect(mockRedisLrange).toHaveBeenCalledWith('chat:mention-pending:r1', 0, -1);
    expect(mockRedisDel).toHaveBeenCalledWith('chat:mention-pending:r1');
    expect(mockSendChatMentionEmail).toHaveBeenCalledWith({
      toEmail: 'recip@example.com',
      recipientUsername: 'recip',
      mentions: [
        { authorUsername: 'author', body: 'hey @recip', createdAt: '2026-05-18T12:00:00.000Z' },
      ],
    });
  });

  it('flushes buffered mentions as a digest when the slot is free again', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockRedisLrange.mockResolvedValueOnce([
      JSON.stringify({
        authorUsername: 'a1',
        body: 'first',
        createdAt: '2026-05-18T11:00:00.000Z',
      }),
      JSON.stringify({
        authorUsername: 'a2',
        body: 'second',
        createdAt: '2026-05-18T11:30:00.000Z',
      }),
    ]);
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith({
      toEmail: 'recip@example.com',
      recipientUsername: 'recip',
      mentions: [
        { authorUsername: 'a1', body: 'first', createdAt: '2026-05-18T11:00:00.000Z' },
        { authorUsername: 'a2', body: 'second', createdAt: '2026-05-18T11:30:00.000Z' },
        { authorUsername: 'author', body: 'hey @recip', createdAt: '2026-05-18T12:00:00.000Z' },
      ],
    });
  });

  it('buffers the mention and skips emailing when the throttle is held', async () => {
    mockRedisSet.mockResolvedValueOnce(null);
    mockRedisRpush.mockResolvedValueOnce(1);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
    expect(mockRedisRpush).toHaveBeenCalledWith(
      'chat:mention-pending:r1',
      JSON.stringify({
        authorUsername: 'author',
        body: 'hey @recip',
        createdAt: '2026-05-18T12:00:00.000Z',
      })
    );
    expect(mockRedisExpire).toHaveBeenCalledWith('chat:mention-pending:r1', 60 * 60 * 24);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Chat mention buffered for digest',
      expect.objectContaining({ userId: 'r1' })
    );
  });

  it('suppresses the email when the recipient has chatted in the last 15 minutes', async () => {
    mockChatUserFindByUserId.mockResolvedValueOnce({
      lastSeenAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockRedisRpush).not.toHaveBeenCalled();
    expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Chat mention email suppressed — recipient active',
      expect.objectContaining({ userId: 'r1' })
    );
  });

  it('still emails when the recipient last chatted more than 15 minutes ago', async () => {
    mockChatUserFindByUserId.mockResolvedValueOnce({
      lastSeenAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockSendChatMentionEmail).toHaveBeenCalled();
  });

  it('re-buffers entries and releases the throttle when sending fails', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockRedisLrange.mockResolvedValueOnce([
      JSON.stringify({
        authorUsername: 'a1',
        body: 'first',
        createdAt: '2026-05-18T11:00:00.000Z',
      }),
    ]);
    mockSendChatMentionEmail.mockRejectedValueOnce(new Error('SES down'));

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockRedisDel).toHaveBeenCalledWith('chat:mention-throttle:r1');
    expect(mockRedisRpush).toHaveBeenCalledWith(
      'chat:mention-pending:r1',
      JSON.stringify({
        authorUsername: 'a1',
        body: 'first',
        createdAt: '2026-05-18T11:00:00.000Z',
      }),
      JSON.stringify({
        authorUsername: 'author',
        body: 'hey @recip',
        createdAt: '2026-05-18T12:00:00.000Z',
      })
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Chat mention email failed',
      expect.objectContaining({ userId: 'r1', error: 'SES down' })
    );
  });

  it('falls back to "Someone" when the author has no username', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions({ ...baseParams, authorUsername: null });

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mentions: [expect.objectContaining({ authorUsername: 'Someone' })],
      })
    );
  });

  it('stringifies non-Error throws when logging the failure', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockRejectedValueOnce('boom-string');

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Chat mention email failed',
      expect.objectContaining({ error: 'boom-string' })
    );
  });

  it('drops malformed buffered entries silently and still emails the current mention', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockRedisLrange.mockResolvedValueOnce(['not-json{', JSON.stringify({ wrong: 'shape' })]);
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mentions: [
          { authorUsername: 'author', body: 'hey @recip', createdAt: '2026-05-18T12:00:00.000Z' },
        ],
      })
    );
  });
});
