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
vi.mock('@/lib/utils/upstash-redis', () => ({
  getRedisClient: () => ({ set: mockRedisSet, del: mockRedisDel }),
}));

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: mockLoggerInfo, error: mockLoggerError } },
}));

beforeEach(() => {
  vi.clearAllMocks();
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
  const params = {
    authorId: 'author-1',
    authorUsername: 'author',
    messageBody: 'hey @recip',
    recipients: [{ id: 'r1', username: 'recip', email: 'recip@example.com' }],
  };

  it('is a no-op when the recipient list is empty', async () => {
    await ChatMentionService.notifyMentions({ ...params, recipients: [] });
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
  });

  it('claims the throttle key and dispatches the email when the slot is free', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(params);

    expect(mockRedisSet).toHaveBeenCalledWith('chat:mention-throttle:author-1:r1', '1', {
      nx: true,
      ex: 300,
    });
    expect(mockSendChatMentionEmail).toHaveBeenCalledWith({
      toEmail: 'recip@example.com',
      recipientUsername: 'recip',
      authorUsername: 'author',
      messageBody: 'hey @recip',
    });
  });

  it('skips the email and logs when the throttle slot is already taken', async () => {
    mockRedisSet.mockResolvedValueOnce(null);

    await ChatMentionService.notifyMentions(params);

    expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Chat mention email throttled',
      expect.objectContaining({ userId: 'r1' })
    );
  });

  it('releases the slot and logs when the email send throws', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockRejectedValueOnce(new Error('SES down'));

    await ChatMentionService.notifyMentions(params);

    expect(mockRedisDel).toHaveBeenCalledWith('chat:mention-throttle:author-1:r1');
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Chat mention email failed',
      expect.objectContaining({ userId: 'r1', error: 'SES down' })
    );
  });

  it('falls back to "Someone" when the author has no username', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions({ ...params, authorUsername: null });

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ authorUsername: 'Someone' })
    );
  });

  it('stringifies non-Error throws when logging the failure', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockRejectedValueOnce('boom-string');

    await ChatMentionService.notifyMentions(params);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Chat mention email failed',
      expect.objectContaining({ error: 'boom-string' })
    );
  });
});
