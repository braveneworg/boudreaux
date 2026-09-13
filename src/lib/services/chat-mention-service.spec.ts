/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ChatMentionService } from './chat-mention-service';

vi.mock('server-only', () => ({}));

const mockSearchByUsernamePrefix = vi.hoisted(() => vi.fn());
const mockFindByUsernames = vi.hoisted(() => vi.fn());
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    searchByUsernamePrefix: mockSearchByUsernamePrefix,
    findByUsernames: mockFindByUsernames,
  },
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
const mockGetRedisClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/upstash-redis', () => ({
  getRedisClient: mockGetRedisClient,
}));

const mockChatUserFindByUserId = vi.hoisted(() => vi.fn());
vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: { findByUserId: mockChatUserFindByUserId },
}));

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedisClient.mockImplementation(() => ({
    set: mockRedisSet,
    del: mockRedisDel,
    rpush: mockRedisRpush,
    lrange: mockRedisLrange,
    expire: mockRedisExpire,
  }));
  mockRedisLrange.mockResolvedValue([]);
  mockChatUserFindByUserId.mockResolvedValue(null);
});

describe('ChatMentionService.searchByPrefix', () => {
  it('returns an empty array for an empty/whitespace prefix', async () => {
    const out = await ChatMentionService.searchByPrefix('   ', 'me');
    expect(out).toEqual([]);
    expect(mockSearchByUsernamePrefix).not.toHaveBeenCalled();
  });

  it('queries the repository with the trimmed prefix and excludes the caller', async () => {
    mockSearchByUsernamePrefix.mockResolvedValueOnce([
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: 'al-bert' },
    ]);

    const out = await ChatMentionService.searchByPrefix('  al  ', 'me');

    expect(mockSearchByUsernamePrefix).toHaveBeenCalledWith('al', 'me', 8);
    expect(out).toEqual([
      { id: 'u1', username: 'alice' },
      { id: 'u2', username: 'al-bert' },
    ]);
  });

  it('filters out rows with a null username', async () => {
    mockSearchByUsernamePrefix.mockResolvedValueOnce([
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
    expect(mockFindByUsernames).not.toHaveBeenCalled();
  });

  it('queries by the extracted usernames and returns matching users', async () => {
    mockFindByUsernames.mockResolvedValueOnce([
      { id: 'u1', username: 'alice', email: 'alice@example.com' },
      { id: 'u2', username: 'bob', email: 'bob@example.com' },
    ]);

    const out = await ChatMentionService.resolveMentions('hi @alice and @bob', 'author-1');

    expect(mockFindByUsernames).toHaveBeenCalledWith(['alice', 'bob'], 'author-1');
    expect(out).toEqual([
      { id: 'u1', username: 'alice', email: 'alice@example.com' },
      { id: 'u2', username: 'bob', email: 'bob@example.com' },
    ]);
  });

  it('drops rows missing username or email', async () => {
    mockFindByUsernames.mockResolvedValueOnce([
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

  it('re-buffers entries and releases the throttle when sending returns false', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockRedisLrange.mockResolvedValueOnce([
      JSON.stringify({
        authorUsername: 'a1',
        body: 'first',
        createdAt: '2026-05-18T11:00:00.000Z',
      }),
    ]);
    mockSendChatMentionEmail.mockResolvedValueOnce(false);

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
      expect.objectContaining({
        userId: 'r1',
        error: 'Chat mention email send returned false',
      })
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

  it('defaults createdAt to the current time when messageCreatedAt is omitted', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    mockSendChatMentionEmail.mockResolvedValueOnce(true);
    const { messageCreatedAt: _omit, ...paramsWithoutCreatedAt } = baseParams;

    await ChatMentionService.notifyMentions(paramsWithoutCreatedAt);

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mentions: [{ authorUsername: 'author', body: 'hey @recip', createdAt: expect.any(String) }],
      })
    );
  });

  it('accepts already-deserialized buffered entries (Upstash JSON auto-parse)', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    // Upstash can auto-deserialize JSON, returning an object rather than a string.
    mockRedisLrange.mockResolvedValueOnce([
      { authorUsername: 'a1', body: 'first', createdAt: '2026-05-18T11:00:00.000Z' },
    ]);
    mockSendChatMentionEmail.mockResolvedValueOnce(true);

    await ChatMentionService.notifyMentions(baseParams);

    expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mentions: [
          { authorUsername: 'a1', body: 'first', createdAt: '2026-05-18T11:00:00.000Z' },
          { authorUsername: 'author', body: 'hey @recip', createdAt: '2026-05-18T12:00:00.000Z' },
        ],
      })
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

  describe('when Redis is unavailable', () => {
    it('resolves without emailing when claiming the throttle rejects', async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(ChatMentionService.notifyMentions(baseParams)).resolves.toBeUndefined();

      expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
    });

    it('warns with the recipient id when claiming the throttle rejects', async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('Unauthorized'));

      await ChatMentionService.notifyMentions(baseParams);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Chat mention email skipped — Redis unavailable',
        expect.objectContaining({ userId: 'r1', error: 'Unauthorized' })
      );
    });

    it('resolves when buffering rejects while the throttle is held', async () => {
      mockRedisSet.mockResolvedValueOnce(null);
      mockRedisRpush.mockRejectedValueOnce(new Error('down'));

      await expect(ChatMentionService.notifyMentions(baseParams)).resolves.toBeUndefined();
    });

    it('resolves when the re-buffer after a failed email rejects', async () => {
      mockRedisSet.mockResolvedValueOnce('OK');
      // First del drains the buffer before the email; the second (throttle
      // release inside the email catch) is the one that fails.
      mockRedisDel.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('down'));
      mockSendChatMentionEmail.mockRejectedValueOnce(new Error('SES down'));

      await expect(ChatMentionService.notifyMentions(baseParams)).resolves.toBeUndefined();
    });

    it('resolves and sends nothing when the Redis client cannot be created', async () => {
      mockGetRedisClient.mockImplementationOnce(() => {
        throw new Error('Upstash Redis is not configured');
      });

      await expect(ChatMentionService.notifyMentions(baseParams)).resolves.toBeUndefined();

      expect(mockSendChatMentionEmail).not.toHaveBeenCalled();
    });

    it('warns once, without a recipient, when the Redis client cannot be created', async () => {
      mockGetRedisClient.mockImplementationOnce(() => {
        throw new Error('Upstash Redis is not configured');
      });

      await ChatMentionService.notifyMentions(baseParams);

      expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Chat mention emails skipped — Redis unavailable',
        expect.objectContaining({ error: 'Upstash Redis is not configured' })
      );
    });

    it("still emails the other recipient when one recipient's Redis call fails", async () => {
      mockRedisSet.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('OK');
      mockSendChatMentionEmail.mockResolvedValueOnce(true);

      await ChatMentionService.notifyMentions({
        ...baseParams,
        recipients: [
          { id: 'r1', username: 'recip', email: 'recip@example.com' },
          { id: 'r2', username: 'other', email: 'other@example.com' },
        ],
      });

      expect(mockSendChatMentionEmail).toHaveBeenCalledTimes(1);
      expect(mockSendChatMentionEmail).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: 'other@example.com' })
      );
    });
  });
});
