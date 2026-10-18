/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { gateAction } from '@/lib/auth/action-gate';
import { ChatService } from '@/lib/services/chat-service';

import { toggleChatReactionAction } from './toggle-chat-reaction-action';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/action-gate');

vi.mock('@/lib/services/chat-service', () => ({
  ChatService: { toggleReaction: vi.fn() },
}));

const validInput = { messageId: 'abcdef1234567890abcdef12', emoji: '🔥' };

beforeEach(() => vi.clearAllMocks());

describe('toggleChatReactionAction', () => {
  it.each([
    ['UNAUTHENTICATED', 'unauthorized'],
    ['BANNED', 'disabled'],
  ] as const)('maps a %s gate refusal to %s without reacting', async (code, error) => {
    vi.mocked(gateAction).mockResolvedValue({ success: false, error: 'refused', code });

    const result = await toggleChatReactionAction(validInput);

    expect(result).toEqual({ success: false, error });
    expect(ChatService.toggleReaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid messageId via Zod', async () => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'user-1' } } as never,
    });

    const result = await toggleChatReactionAction({ messageId: 'bad', emoji: '🔥' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
    expect(result.fieldErrors?.messageId).toBeDefined();
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'user-1' } } as never,
    });

    const result = await toggleChatReactionAction(
      null as unknown as Parameters<typeof toggleChatReactionAction>[0]
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
    expect(result.fieldErrors).toHaveProperty('_form');
  });

  it('forwards a valid toggle to the service and returns the DTO', async () => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'user-1' } } as never,
    });
    vi.mocked(ChatService.toggleReaction).mockResolvedValue({
      success: true,
      data: { id: 'msg-1' } as never,
    });

    const result = await toggleChatReactionAction(validInput);

    expect(ChatService.toggleReaction).toHaveBeenCalledWith({
      messageId: validInput.messageId,
      userId: 'user-1',
      emoji: '🔥',
    });
    expect(result).toEqual({ success: true, data: { id: 'msg-1' } });
  });

  it('passes through service errors (not_found, disabled)', async () => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'user-1' } } as never,
    });
    vi.mocked(ChatService.toggleReaction).mockResolvedValue({
      success: false,
      error: 'not_found',
    });

    const result = await toggleChatReactionAction(validInput);

    expect(result).toEqual({ success: false, error: 'not_found' });
  });
});
