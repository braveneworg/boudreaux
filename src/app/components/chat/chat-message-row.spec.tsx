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

  describe('accessibility contrast', () => {
    const adminUser = { id: 'admin-1', username: 'mod', gravatarHash: 'h', role: 'admin' as const };

    it('renders the "(moderator)" badge with AA-contrast text (zinc-700, not muted)', () => {
      render(<ChatMessageRow message={makeMsg({ user: adminUser })} />);
      const badge = screen.getByText('(moderator)');
      expect(badge).toHaveClass('text-zinc-700');
      expect(badge).not.toHaveClass('text-muted-foreground');
    });

    it('renders the timestamp with AA-contrast text (zinc-700, not muted)', () => {
      const { container } = render(<ChatMessageRow message={makeMsg()} />);
      const timeEl = container.querySelector('time');
      if (!timeEl) throw new Error('Expected a time element');
      expect(timeEl).toHaveClass('text-zinc-700');
      expect(timeEl).not.toHaveClass('text-muted-foreground');
    });

    it('keeps the AA-contrast classes for right-aligned rows', () => {
      const { container } = render(
        <ChatMessageRow align="right" message={makeMsg({ user: adminUser })} />
      );
      expect(screen.getByText('(moderator)')).toHaveClass('text-zinc-700');
      const timeEl = container.querySelector('time');
      expect(timeEl).toHaveClass('text-zinc-700');
    });
  });

  describe('admin markdown', () => {
    const adminUser = { id: 'admin-1', username: 'mod', gravatarHash: 'h', role: 'admin' as const };

    it('renders bold and emphasis for admin authors', () => {
      const { container } = render(
        <ChatMessageRow message={makeMsg({ user: adminUser, body: 'this is **bold** and *em*' })} />
      );
      expect(container.querySelector('strong')?.textContent).toBe('bold');
      expect(container.querySelector('em')?.textContent).toBe('em');
    });

    it('does not render markdown for non-admin authors', () => {
      const { container } = render(
        <ChatMessageRow message={makeMsg({ body: 'this is **bold** and *em*' })} />
      );
      expect(container.querySelector('strong')).toBeNull();
      expect(container.querySelector('em')).toBeNull();
      expect(container.textContent).toContain('**bold**');
    });

    it('renders an internal link without a new tab or external icon', () => {
      const { container } = render(
        <ChatMessageRow
          message={makeMsg({ user: adminUser, body: 'check [our roster](/artists)' })}
        />
      );
      const anchor = container.querySelector('a');
      if (!anchor) throw new Error('Expected an anchor');
      expect(anchor.getAttribute('href')).toBe('/artists');
      expect(anchor.getAttribute('target')).toBeNull();
      expect(anchor.querySelector('[aria-label="opens in a new tab"]')).toBeNull();
    });

    it('renders an external link in a new tab with the external icon', () => {
      const { container } = render(
        <ChatMessageRow
          message={makeMsg({
            user: adminUser,
            body: 'see [wiki](https://en.wikipedia.org/wiki/Hip_hop)',
          })}
        />
      );
      const anchor = container.querySelector('a');
      if (!anchor) throw new Error('Expected an anchor');
      expect(anchor.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Hip_hop');
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toContain('noopener');
      expect(anchor.querySelector('[aria-label="opens in a new tab"]')).not.toBeNull();
    });

    it('refuses to render a javascript: link as an anchor', () => {
      const { container } = render(
        <ChatMessageRow message={makeMsg({ user: adminUser, body: '[x](javascript:alert(1))' })} />
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('[x](javascript:alert(1))');
    });

    it('still highlights @mentions inside admin-formatted text', () => {
      const { container } = render(
        <ChatMessageRow message={makeMsg({ user: adminUser, body: '**hi @alice**' })} />
      );
      const strong = container.querySelector('strong');
      if (!strong) throw new Error('Expected a strong element');
      expect(strong.querySelector('[data-mention-username="alice"]')).not.toBeNull();
    });
  });
});
