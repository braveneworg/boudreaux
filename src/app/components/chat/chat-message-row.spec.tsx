// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatMessageRow } from './chat-message-row';

const makeMsg = (overrides?: Partial<OptimisticChatMessage>): OptimisticChatMessage => ({
  id: 'msg-1',
  body: 'hello world',
  reactions: [],
  createdAt: '2026-05-01T12:00:00Z',
  user: { id: 'user-1', username: 'octo', gravatarHash: 'abc' },
  ...overrides,
});

describe('ChatMessageRow', () => {
  it('renders username, body, and a locale-formatted timestamp', () => {
    const { container } = render(<ChatMessageRow message={makeMsg()} />);

    expect(screen.getByText('octo')).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
    const timeEl = container.querySelector('time');
    if (!timeEl) throw new Error('Expected a time element');
    expect(timeEl).toHaveAttribute('dateTime', '2026-05-01T12:00:00Z');
  });

  it('falls back to "unknown" when the user has no username', () => {
    render(
      <ChatMessageRow message={makeMsg({ user: { id: 'u', username: null, gravatarHash: 'h' } })} />
    );
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('preserves newlines in the body via whitespace-pre-wrap', () => {
    const { container } = render(<ChatMessageRow message={makeMsg({ body: 'line 1\nline 2' })} />);
    const body = container.querySelector('p');
    expect(body).toHaveClass('whitespace-pre-wrap');
    expect(body?.textContent).toContain('line 1\nline 2');
  });

  it('shows a sending spinner for optimistic placeholders', () => {
    render(<ChatMessageRow message={makeMsg({ tempId: 'tmp-1' })} />);
    expect(screen.getByLabelText('sending')).toBeInTheDocument();
    expect(screen.getByTestId('chat-message-row')).toHaveAttribute('data-pending', 'true');
  });

  it('shows a failed marker on the destructive background', () => {
    render(<ChatMessageRow message={makeMsg({ tempId: 'tmp-1', failed: true })} />);
    expect(screen.getByLabelText('send failed')).toBeInTheDocument();
    expect(screen.getByTestId('chat-message-row')).toHaveAttribute('data-failed', 'true');
  });

  it('renders an injected reaction-bar slot when provided', () => {
    render(
      <ChatMessageRow
        message={makeMsg()}
        reactionBar={<div data-testid="reaction-bar-slot">bar</div>}
      />
    );
    expect(screen.getByTestId('reaction-bar-slot')).toBeInTheDocument();
  });

  it('omits the reaction area entirely when no slot is provided', () => {
    const { container } = render(<ChatMessageRow message={makeMsg()} />);
    expect(container.querySelectorAll('.pl-8')).toHaveLength(1); // only the body has pl-8
  });

  it('renders the optional pinIndicator slot inside the header', () => {
    render(
      <ChatMessageRow
        message={makeMsg()}
        pinIndicator={<button data-testid="pin-indicator">pin</button>}
      />
    );
    expect(screen.getByTestId('pin-indicator')).toBeInTheDocument();
  });

  it('formats the timestamp on mount using the viewer locale (short + long title)', async () => {
    const { container } = render(<ChatMessageRow message={makeMsg()} />);

    const timeEl = container.querySelector('time');
    if (!timeEl) throw new Error('Expected a time element');
    // The mount-only effect populates the short text and the title.
    await waitFor(() => expect(timeEl.textContent?.trim()).not.toBe(''));
    expect(timeEl.getAttribute('title')).toBeTruthy();
    expect(timeEl).toHaveAttribute('dateTime', '2026-05-01T12:00:00Z');
  });

  it('produces empty short/long strings when the createdAt cannot be parsed', () => {
    const { container } = render(<ChatMessageRow message={makeMsg({ createdAt: 'not-a-date' })} />);

    const timeEl = container.querySelector('time');
    if (!timeEl) throw new Error('Expected a time element');
    // Effect runs and returns the empty fallback — no crash, no visible text.
    expect(timeEl.textContent?.trim()).toBe('');
    expect(timeEl.getAttribute('title')).toBe('');
  });
});
