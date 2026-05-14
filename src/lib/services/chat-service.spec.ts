/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatRateLimitLogRepository } from '@/lib/repositories/chat-rate-limit-log-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { checkChatRateLimit } from '@/lib/utils/chat-rate-limit';
import { gravatarHash } from '@/lib/utils/gravatar-hash';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';

import { ChatService } from './chat-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/chat-message-repository', () => ({
  ChatMessageRepository: {
    create: vi.fn(),
    findRecent: vi.fn(),
    findById: vi.fn(),
    setReactions: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    incrementMessageCount: vi.fn(),
    setFlagged: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/chat-rate-limit-log-repository', () => ({
  ChatRateLimitLogRepository: {
    logBreach: vi.fn(),
  },
}));

vi.mock('@/lib/utils/chat-rate-limit', () => ({
  CHAT_RATE_LIMIT_PER_MINUTE: 10,
  CHAT_FLAG_THRESHOLD: 8,
  checkChatRateLimit: vi.fn(),
}));

vi.mock('@/lib/utils/pusher-server', () => ({
  CHAT_EVENTS: {
    newMessage: 'new-message',
    reactionUpdated: 'reaction-updated',
    messageDeleted: 'message-deleted',
  },
  triggerChatEvent: vi.fn(),
}));

// `@/lib/prisma` is no longer imported directly by chat-service after the
// repository-pattern fixup (see Phase-8 review M2). No mock needed here.

const sampleUser = { id: 'user-1', username: 'octo', email: 'octo@example.com' };
const sampleMessage = {
  id: 'msg-1',
  userId: 'user-1',
  body: 'hi',
  reactions: [],
  createdAt: new Date('2026-05-01T12:00:00Z'),
  user: sampleUser,
};

describe('ChatService.listRecent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reverses repository output into chronological order and attaches gravatar hash', async () => {
    vi.mocked(ChatMessageRepository.findRecent).mockResolvedValue([
      { ...sampleMessage, id: 'msg-2', body: 'second' },
      { ...sampleMessage, id: 'msg-1', body: 'first' },
    ] as never);

    const result = await ChatService.listRecent({ limit: 20 });

    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    expect(result[0].user.gravatarHash).toBe(gravatarHash('octo@example.com'));
    expect(result[0]).not.toHaveProperty('email');
  });

  it('falls back to an empty reactions array when the JSON column is malformed', async () => {
    vi.mocked(ChatMessageRepository.findRecent).mockResolvedValue([
      { ...sampleMessage, reactions: { not: 'an array' } as unknown },
    ] as never);

    const [dto] = await ChatService.listRecent({ limit: 20 });

    expect(dto.reactions).toEqual([]);
  });
});

describe('ChatService.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkChatRateLimit).mockResolvedValue({
      success: true,
      remaining: 9,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue(null);
    vi.mocked(ChatMessageRepository.create).mockResolvedValue(sampleMessage as never);
  });

  it('persists the message, increments the count, and broadcasts via Pusher', async () => {
    const result = await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(result.success).toBe(true);
    expect(ChatMessageRepository.create).toHaveBeenCalledWith({ userId: 'user-1', body: 'hi' });
    expect(ChatUserRepository.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      fingerprint: 'fp-abc',
      ipAddress: '203.0.113.5',
    });
    expect(ChatUserRepository.incrementMessageCount).toHaveBeenCalledWith('user-1');
    expect(triggerChatEvent).toHaveBeenCalledWith(
      CHAT_EVENTS.newMessage,
      expect.objectContaining({ id: 'msg-1' })
    );
  });

  it('returns disabled when the ChatUser row is gated', async () => {
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue({
      disabled: true,
      flagged: false,
    } as never);

    const result = await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(result).toEqual({ success: false, error: 'disabled' });
    expect(ChatMessageRepository.create).not.toHaveBeenCalled();
    expect(triggerChatEvent).not.toHaveBeenCalled();
  });

  it('logs a breach and returns rate_limited when the limiter rejects', async () => {
    vi.mocked(checkChatRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 12_000,
      retryAfterSeconds: 12,
    });

    const result = await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(result).toEqual({ success: false, error: 'rate_limited', retryAfterSeconds: 12 });
    expect(ChatRateLimitLogRepository.logBreach).toHaveBeenCalledWith({
      fingerprint: 'fp-abc',
      ipAddress: '203.0.113.5',
    });
    expect(ChatMessageRepository.create).not.toHaveBeenCalled();
  });

  it('auto-flags the sender when sends-in-window reach the threshold', async () => {
    // remaining=2 -> sendsInWindow=8 -> at the flag threshold
    vi.mocked(checkChatRateLimit).mockResolvedValue({
      success: true,
      remaining: 2,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });

    await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(ChatUserRepository.setFlagged).toHaveBeenCalledWith('user-1', true);
  });

  it('does not re-flag a user already marked flagged', async () => {
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue({
      disabled: false,
      flagged: true,
    } as never);
    vi.mocked(checkChatRateLimit).mockResolvedValue({
      success: true,
      remaining: 1,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });

    await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(ChatUserRepository.setFlagged).not.toHaveBeenCalled();
  });

  it('does not flag when sends-in-window is below the threshold', async () => {
    vi.mocked(checkChatRateLimit).mockResolvedValue({
      success: true,
      remaining: 5,
      reset: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });

    await ChatService.sendMessage({
      userId: 'user-1',
      email: 'octo@example.com',
      body: 'hi',
      fingerprint: 'fp-abc',
      ip: '203.0.113.5',
    });

    expect(ChatUserRepository.setFlagged).not.toHaveBeenCalled();
  });
});

describe('ChatService.toggleReaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue(null);
  });

  it('returns not_found when the message id is unknown', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue(null);

    const result = await ChatService.toggleReaction({
      messageId: 'missing',
      userId: 'user-1',
      emoji: '🔥',
    });

    expect(result).toEqual({ success: false, error: 'not_found' });
  });

  it('returns disabled when the toggling user is gated', async () => {
    vi.mocked(ChatUserRepository.findByUserId).mockResolvedValue({
      disabled: true,
    } as never);

    const result = await ChatService.toggleReaction({
      messageId: 'msg-1',
      userId: 'user-1',
      emoji: '🔥',
    });

    expect(result).toEqual({ success: false, error: 'disabled' });
    expect(ChatMessageRepository.setReactions).not.toHaveBeenCalled();
  });

  it('adds a new emoji entry when none exists', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      ...sampleMessage,
      reactions: [],
    } as never);

    await ChatService.toggleReaction({ messageId: 'msg-1', userId: 'user-1', emoji: '🔥' });

    expect(ChatMessageRepository.setReactions).toHaveBeenCalledWith('msg-1', [
      { emoji: '🔥', userIds: ['user-1'] },
    ]);
  });

  it('adds the user to an existing emoji entry', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      ...sampleMessage,
      reactions: [{ emoji: '🔥', userIds: ['user-2'] }],
    } as never);

    await ChatService.toggleReaction({ messageId: 'msg-1', userId: 'user-1', emoji: '🔥' });

    expect(ChatMessageRepository.setReactions).toHaveBeenCalledWith('msg-1', [
      { emoji: '🔥', userIds: ['user-2', 'user-1'] },
    ]);
  });

  it('removes the user from an existing emoji entry, keeping other voters', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      ...sampleMessage,
      reactions: [{ emoji: '🔥', userIds: ['user-1', 'user-2'] }],
    } as never);

    await ChatService.toggleReaction({ messageId: 'msg-1', userId: 'user-1', emoji: '🔥' });

    expect(ChatMessageRepository.setReactions).toHaveBeenCalledWith('msg-1', [
      { emoji: '🔥', userIds: ['user-2'] },
    ]);
  });

  it('drops the entry entirely when the last voter unreacts', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      ...sampleMessage,
      reactions: [{ emoji: '🔥', userIds: ['user-1'] }],
    } as never);

    await ChatService.toggleReaction({ messageId: 'msg-1', userId: 'user-1', emoji: '🔥' });

    expect(ChatMessageRepository.setReactions).toHaveBeenCalledWith('msg-1', []);
  });

  it('broadcasts the updated message via Pusher', async () => {
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      ...sampleMessage,
      reactions: [],
    } as never);

    await ChatService.toggleReaction({ messageId: 'msg-1', userId: 'user-1', emoji: '🔥' });

    expect(triggerChatEvent).toHaveBeenCalledWith(
      CHAT_EVENTS.reactionUpdated,
      expect.objectContaining({ id: 'msg-1' })
    );
  });
});
