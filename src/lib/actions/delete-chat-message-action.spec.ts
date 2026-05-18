/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { auth } from '@/auth';
import { ChatMessageRepository } from '@/lib/repositories/chat-message-repository';
import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { CHAT_EVENTS, triggerChatEvent } from '@/lib/utils/pusher-server';

import { deleteChatMessageAction } from './delete-chat-message-action';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: {
    hideMessage: vi.fn(),
    hideAllMessagesByUser: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/chat-message-repository', () => ({
  ChatMessageRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/utils/pusher-server', () => ({
  CHAT_EVENTS: { messageDeleted: 'message-deleted' },
  triggerChatEvent: vi.fn(),
}));

const adminSession = { user: { id: 'admin-1', role: 'admin' } };

beforeEach(() => vi.clearAllMocks());

describe('deleteChatMessageAction', () => {
  it('returns unauthorized when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await deleteChatMessageAction({ messageId: 'msg-1', scope: 'message' });

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(ChatAdminService.hideMessage).not.toHaveBeenCalled();
  });

  it('returns forbidden when the user is not an admin', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role: 'member' } } as never);

    const result = await deleteChatMessageAction({ messageId: 'msg-1', scope: 'message' });

    expect(result).toEqual({ success: false, error: 'forbidden' });
  });

  it('returns invalid when the messageId is blank', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);

    const result = await deleteChatMessageAction({ messageId: '   ', scope: 'message' });

    expect(result).toEqual({ success: false, error: 'invalid' });
  });

  it('returns invalid when the scope is unknown', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);

    const result = await deleteChatMessageAction({
      messageId: 'msg-1',
      scope: 'whatever' as never,
    });

    expect(result).toEqual({ success: false, error: 'invalid' });
  });

  it('hides a single message and broadcasts the deletion', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(ChatAdminService.hideMessage).mockResolvedValue({} as never);

    const result = await deleteChatMessageAction({ messageId: 'msg-1', scope: 'message' });

    expect(ChatAdminService.hideMessage).toHaveBeenCalledWith({
      messageId: 'msg-1',
      adminId: 'admin-1',
    });
    expect(triggerChatEvent).toHaveBeenCalledWith(CHAT_EVENTS.messageDeleted, {
      messageId: 'msg-1',
    });
    expect(result).toEqual({ success: true, deletedIds: ['msg-1'] });
  });

  it('returns not_found when scope=user but the target message is missing', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue(null);

    const result = await deleteChatMessageAction({ messageId: 'msg-x', scope: 'user' });

    expect(result).toEqual({ success: false, error: 'not_found' });
    expect(ChatAdminService.hideAllMessagesByUser).not.toHaveBeenCalled();
  });

  it('hides every visible message by the author and broadcasts one event per id', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(ChatMessageRepository.findById).mockResolvedValue({
      id: 'msg-1',
      userId: 'user-9',
    } as never);
    vi.mocked(ChatAdminService.hideAllMessagesByUser).mockResolvedValue(['a', 'b']);

    const result = await deleteChatMessageAction({ messageId: 'msg-1', scope: 'user' });

    expect(ChatAdminService.hideAllMessagesByUser).toHaveBeenCalledWith({
      userId: 'user-9',
      adminId: 'admin-1',
    });
    expect(triggerChatEvent).toHaveBeenCalledTimes(2);
    expect(triggerChatEvent).toHaveBeenCalledWith(CHAT_EVENTS.messageDeleted, { messageId: 'a' });
    expect(triggerChatEvent).toHaveBeenCalledWith(CHAT_EVENTS.messageDeleted, { messageId: 'b' });
    expect(result).toEqual({ success: true, deletedIds: ['a', 'b'] });
  });
});
