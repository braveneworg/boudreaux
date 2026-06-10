// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { sendChatMessageAction } from '@/lib/actions/send-chat-message-action';

import { ChatInput } from './chat-input';

vi.mock('@/lib/actions/send-chat-message-action', () => ({
  sendChatMessageAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMentionQuery = vi.fn();
vi.mock('@/hooks/use-mention-search-query', () => ({
  useMentionSearchQuery: (query: string, enabled: boolean) => mockMentionQuery(query, enabled),
}));

const baseProps = {
  fingerprint: 'fp-abc123',
  currentUser: { id: 'user-1', username: 'octo', gravatarHash: 'abc' },
};

const noopHandlers = () => ({
  onOptimisticAppend: vi.fn(),
  onSendResolved: vi.fn(),
  onSendFailed: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockMentionQuery.mockReturnValue({ data: undefined, isFetching: false });
});

describe('ChatInput', () => {
  it('renders a placeholder textarea and a disabled send button initially', () => {
    render(<ChatInput {...baseProps} {...noopHandlers()} />);

    expect(screen.getByPlaceholderText('Say something…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('enables the send button once the textarea has non-whitespace content', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ChatInput {...baseProps} {...noopHandlers()} />);

    await user.type(screen.getByLabelText('Chat message'), 'hi');

    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
  });

  it('appends an optimistic draft and clears the textarea on Enter', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockResolvedValue({
      success: true,
      data: { id: 'msg-1' } as never,
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;

    await user.type(textarea, 'hello{Enter}');

    expect(handlers.onOptimisticAppend).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'hello', tempId: expect.stringMatching(/^tmp-/) })
    );
    expect(textarea.value).toBe('');
    await waitFor(() => expect(handlers.onSendResolved).toHaveBeenCalled());
  });

  it('inserts a newline (no send) on Shift+Enter', async () => {
    const handlers = noopHandlers();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;

    await user.type(textarea, 'line 1{Shift>}{Enter}{/Shift}line 2');

    expect(textarea.value).toBe('line 1\nline 2');
    expect(handlers.onOptimisticAppend).not.toHaveBeenCalled();
  });

  it('shows a rate-limit toast and marks the send failed on rate_limited', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockResolvedValue({
      success: false,
      error: 'rate_limited',
      retryAfterSeconds: 12,
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    await waitFor(() => expect(handlers.onSendFailed).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/slow down.*12/i));
  });

  it('shows a disabled toast when the server reports the user is gated', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockResolvedValue({
      success: false,
      error: 'disabled',
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/disabled/i))
    );
  });

  it('does not send when the fingerprint is not yet ready', async () => {
    const handlers = noopHandlers();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} fingerprint={null} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    expect(sendChatMessageAction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/preparing chat/i));
  });

  it('does not send a whitespace-only body', async () => {
    const handlers = noopHandlers();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    const textarea = screen.getByLabelText('Chat message');
    await user.type(textarea, '   ');
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    });

    expect(sendChatMessageAction).not.toHaveBeenCalled();
  });

  it('shows an unauthorized toast when the server reports unauthorized', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockResolvedValue({
      success: false,
      error: 'unauthorized',
    });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/sign in/i))
    );
  });

  it('shows a generic toast on an unknown server error', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockResolvedValue({
      success: false,
      error: 'unknown',
    } as never);
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be sent/i))
    );
  });

  it('shows a generic error toast when the action throws', async () => {
    const handlers = noopHandlers();
    vi.mocked(sendChatMessageAction).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} />);
    await user.type(screen.getByLabelText('Chat message'), 'hi{Enter}');

    await waitFor(() => expect(handlers.onSendFailed).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/couldn't send your message/i));
  });

  it('calls onTyping when typing non-whitespace content', async () => {
    const handlers = noopHandlers();
    const onTyping = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(<ChatInput {...baseProps} {...handlers} onTyping={onTyping} />);
    await user.type(screen.getByLabelText('Chat message'), 'a');

    expect(onTyping).toHaveBeenCalled();
  });

  it('truncates input beyond MAX_BODY (2000 chars)', async () => {
    const handlers = noopHandlers();
    render(<ChatInput {...baseProps} {...handlers} />);
    const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;

    // userEvent.type would be too slow for 2001 chars — use fireEvent-like change
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      setter?.call(textarea, 'a'.repeat(2500));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(textarea.value.length).toBe(2000);
  });

  describe('mention autocomplete', () => {
    const matches = [
      { id: 'u1', username: 'alice', gravatarHash: 'h1' },
      { id: 'u2', username: 'bob', gravatarHash: 'h2' },
    ];

    beforeEach(() => {
      mockMentionQuery.mockReturnValue({ data: matches, isFetching: false });
    });

    it('opens the autocomplete when typing @', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<ChatInput {...baseProps} {...noopHandlers()} />);

      await user.type(screen.getByLabelText('Chat message'), '@al');

      expect(screen.getByRole('listbox', { name: /mention suggestions/i })).toBeInTheDocument();
    });

    it('cycles down through matches with ArrowDown and inserts on Enter', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<ChatInput {...baseProps} {...noopHandlers()} />);
      const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;

      await user.type(textarea, '@a');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      await waitFor(() => expect(textarea.value).toMatch(/^@bob /));
    });

    it('cycles up with ArrowUp (wraps around)', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<ChatInput {...baseProps} {...noopHandlers()} />);
      const textarea = screen.getByLabelText('Chat message') as HTMLTextAreaElement;

      await user.type(textarea, '@a');
      await user.keyboard('{ArrowUp}');
      await user.keyboard('{Tab}');

      await waitFor(() => expect(textarea.value).toMatch(/^@bob /));
    });

    it('closes the autocomplete on Escape', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<ChatInput {...baseProps} {...noopHandlers()} />);

      await user.type(screen.getByLabelText('Chat message'), '@a');
      expect(screen.getByRole('listbox', { name: /mention suggestions/i })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(
        screen.queryByRole('listbox', { name: /mention suggestions/i })
      ).not.toBeInTheDocument();
    });

    it('closes the autocomplete on blur', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(
        <>
          <ChatInput {...baseProps} {...noopHandlers()} />
          <button type="button">outside</button>
        </>
      );

      await user.type(screen.getByLabelText('Chat message'), '@a');
      expect(screen.getByRole('listbox', { name: /mention suggestions/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'outside' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('listbox', { name: /mention suggestions/i })
        ).not.toBeInTheDocument()
      );
    });
  });
});
