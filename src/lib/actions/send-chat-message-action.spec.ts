/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { headers } from 'next/headers';

import { auth } from '@/auth';
import { ChatService } from '@/lib/services/chat-service';

import { sendChatMessageAction } from './send-chat-message-action';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('next/headers', () => ({ headers: vi.fn() }));

vi.mock('@/lib/services/chat-service', () => ({
  ChatService: {
    sendMessage: vi.fn(),
  },
}));

const makeHeaders = (entries: Record<string, string>) => new Headers(entries);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(makeHeaders({ 'x-real-ip': '203.0.113.5' }) as never);
});

describe('sendChatMessageAction', () => {
  const validInput = { body: 'hello', fingerprint: 'abcdef1234567890' };

  it('returns unauthorized when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await sendChatMessageAction(validInput);

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(ChatService.sendMessage).not.toHaveBeenCalled();
  });

  it('returns unauthorized when the session has no email', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);

    const result = await sendChatMessageAction(validInput);

    expect(result).toEqual({ success: false, error: 'unauthorized' });
  });

  it('returns invalid with field errors when the Zod validation fails', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);

    const result = await sendChatMessageAction({ body: '', fingerprint: 'short' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
    expect(result.fieldErrors).toBeDefined();
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);

    const result = await sendChatMessageAction(
      null as unknown as Parameters<typeof sendChatMessageAction>[0]
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
    expect(result.fieldErrors).toHaveProperty('_form');
  });

  it('forwards the resolved IP and user fields to the service', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);
    vi.mocked(ChatService.sendMessage).mockResolvedValue({
      success: true,
      data: { id: 'msg-1' } as never,
    });

    await sendChatMessageAction(validInput);

    expect(ChatService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'octo@example.com',
        body: 'hello',
        fingerprint: 'abcdef1234567890',
        ip: '203.0.113.5',
        banned: false,
      })
    );
  });

  it('passes through rate_limited with retryAfterSeconds', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);
    vi.mocked(ChatService.sendMessage).mockResolvedValue({
      success: false,
      error: 'rate_limited',
      retryAfterSeconds: 12,
    });

    const result = await sendChatMessageAction(validInput);

    expect(result).toEqual({
      success: false,
      error: 'rate_limited',
      retryAfterSeconds: 12,
    });
  });

  it('passes through disabled', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);
    vi.mocked(ChatService.sendMessage).mockResolvedValue({
      success: false,
      error: 'disabled',
    });

    const result = await sendChatMessageAction(validInput);

    expect(result).toEqual({ success: false, error: 'disabled' });
  });

  it('returns success + DTO on the happy path', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'octo@example.com' },
    } as never);
    const dto = { id: 'msg-1' };
    vi.mocked(ChatService.sendMessage).mockResolvedValue({
      success: true,
      data: dto as never,
    });

    const result = await sendChatMessageAction(validInput);

    expect(result).toEqual({ success: true, data: dto });
  });
});
