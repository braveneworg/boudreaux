/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { auth } from '@/auth';
import { ChatService } from '@/lib/services/chat-service';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';

import { togglePinChatMessageAction } from './toggle-pin-chat-message-action';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/services/chat-service', () => ({
  ChatService: { togglePin: vi.fn() },
  MAX_PINNED_CHAT_MESSAGES: 3,
}));

vi.mock('@/lib/utils/pusher-server', () => ({
  CHAT_EVENTS: { messagePinChanged: 'message-pin-changed' },
  triggerChatEvent: vi.fn(),
}));

const adminSession = { user: { id: 'admin-1', role: 'admin' } };

beforeEach(() => vi.clearAllMocks());

describe('togglePinChatMessageAction', () => {
  it('returns unauthorized when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await togglePinChatMessageAction({ messageId: 'msg-1' });

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(ChatService.togglePin).not.toHaveBeenCalled();
  });

  it('returns forbidden when the user is not an admin', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role: 'member' } } as never);

    const result = await togglePinChatMessageAction({ messageId: 'msg-1' });

    expect(result).toEqual({ success: false, error: 'forbidden' });
  });

  it('returns invalid when the messageId is blank', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);

    const result = await togglePinChatMessageAction({ messageId: '   ' });

    expect(result).toEqual({ success: false, error: 'invalid' });
  });

  it('decorates limit_reached with the configured cap', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(ChatService.togglePin).mockResolvedValue({
      success: false,
      error: 'limit_reached',
    });

    const result = await togglePinChatMessageAction({ messageId: 'msg-1' });

    expect(result).toEqual({ success: false, error: 'limit_reached', limit: 3 });
    expect(triggerChatEvent).not.toHaveBeenCalled();
  });

  it('passes through not_found from the service', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(ChatService.togglePin).mockResolvedValue({
      success: false,
      error: 'not_found',
    });

    const result = await togglePinChatMessageAction({ messageId: 'msg-1' });

    expect(result).toEqual({ success: false, error: 'not_found' });
  });

  it('broadcasts the updated DTO and returns it on success', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const dto = { id: 'msg-1', pinnedAt: '2026-05-02T10:00:00.000Z' };
    vi.mocked(ChatService.togglePin).mockResolvedValue({
      success: true,
      data: dto as never,
      pinned: true,
    });

    const result = await togglePinChatMessageAction({ messageId: 'msg-1' });

    expect(ChatService.togglePin).toHaveBeenCalledWith({
      messageId: 'msg-1',
      adminId: 'admin-1',
    });
    expect(triggerChatEvent).toHaveBeenCalledWith(CHAT_EVENTS.messagePinChanged, dto);
    expect(result).toEqual({ success: true, data: dto, pinned: true });
  });
});
