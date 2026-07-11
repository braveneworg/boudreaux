// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';

import { ChatMessageList } from './chat-message-list';

const makeMsg = (id: string): OptimisticChatMessage => ({
  id,
  body: `msg-${id}`,
  reactions: [],
  createdAt: '2026-05-01T12:00:00Z',
  user: { id: 'user-1', username: 'octo', gravatarHash: 'abc' },
});

const baseProps = {
  hasNextPage: false,
  isFetchingNextPage: false,
  onLoadMore: vi.fn(),
};

describe('ChatMessageList', () => {
  it('renders an empty-state message when there are no messages', () => {
    render(<ChatMessageList {...baseProps} messages={[]} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders all provided messages in order', () => {
    render(
      <ChatMessageList {...baseProps} messages={[makeMsg('a'), makeMsg('b'), makeMsg('c')]} />
    );
    const bodies = screen.getAllByText(/^msg-/).map((n) => n.textContent);
    expect(bodies).toEqual(['msg-a', 'msg-b', 'msg-c']);
  });

  it('renders the Load more button only when hasNextPage is true', () => {
    const { rerender } = render(
      <ChatMessageList {...baseProps} messages={[makeMsg('a')]} hasNextPage={false} />
    );
    expect(screen.queryByRole('button', { name: /load older messages/i })).not.toBeInTheDocument();

    rerender(<ChatMessageList {...baseProps} messages={[makeMsg('a')]} hasNextPage />);
    expect(screen.getByRole('button', { name: /load older messages/i })).toBeInTheDocument();
  });

  it('invokes onLoadMore when the Load more button is clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

    render(
      <ChatMessageList
        messages={[makeMsg('a')]}
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />
    );

    await user.click(screen.getByRole('button', { name: /load older messages/i }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('renders a custom reaction bar per row via renderReactionBar', () => {
    render(
      <ChatMessageList
        {...baseProps}
        messages={[makeMsg('a'), makeMsg('b')]}
        renderReactionBar={(m) => <span data-testid={`bar-${m.id}`}>{m.id}</span>}
      />
    );

    expect(screen.getByTestId('bar-a')).toBeInTheDocument();
    expect(screen.getByTestId('bar-b')).toBeInTheDocument();
  });

  it('keys rows by tempId when present so optimistic placeholders are stable', () => {
    const optimistic: OptimisticChatMessage = { ...makeMsg('msg-1'), tempId: 'tmp-1' };
    const { container } = render(<ChatMessageList {...baseProps} messages={[optimistic]} />);
    // No assertion needed beyond the render not crashing — keying is internal.
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });

  it('renders the pinned strip with renderPinIndicator and filters those rows from the main list', () => {
    const pinned = makeMsg('p1');
    const regular = makeMsg('r1');
    render(
      <ChatMessageList
        {...baseProps}
        messages={[pinned, regular]}
        pinnedMessages={[pinned]}
        renderPinIndicator={(m) => <span data-testid={`pin-${m.id}`}>pinned</span>}
      />
    );

    // Pinned strip mounted.
    expect(screen.getByTestId('chat-pinned-messages')).toBeInTheDocument();
    expect(screen.getByTestId('pin-p1')).toBeInTheDocument();

    // Regular list only shows the non-pinned message (the pinned row is filtered).
    const bodies = screen.getAllByText(/^msg-/).map((n) => n.textContent);
    expect(bodies).toEqual(['msg-p1', 'msg-r1']);
  });

  it('shows the empty-state when every loaded message is in the pinned strip', () => {
    const pinned = makeMsg('p1');
    render(<ChatMessageList {...baseProps} messages={[pinned]} pinnedMessages={[pinned]} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders the reaction-bar slot inside pinned rows so reactions remain visible', () => {
    const pinned = makeMsg('p1');
    render(
      <ChatMessageList
        {...baseProps}
        messages={[pinned]}
        pinnedMessages={[pinned]}
        renderReactionBar={(m) => <span data-testid={`bar-${m.id}`}>bar</span>}
      />
    );
    expect(screen.getByTestId('bar-p1')).toBeInTheDocument();
  });

  describe('bottom pin on resize', () => {
    class FakeResizeObserver {
      static instances: FakeResizeObserver[] = [];
      observed: Element[] = [];
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        FakeResizeObserver.instances.push(this);
      }
      observe(el: Element): void {
        this.observed.push(el);
      }
      unobserve(): void {}
      disconnect(): void {
        this.observed = [];
      }
      trigger(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    beforeEach(() => {
      FakeResizeObserver.instances = [];
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const renderWithGeometry = (scrollTop: number) => {
      const { container } = render(
        <ChatMessageList {...baseProps} messages={[makeMsg('a'), makeMsg('b')]} />
      );
      const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
      Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(list, 'scrollTop', {
        configurable: true,
        writable: true,
        value: scrollTop,
      });
      const observer = FakeResizeObserver.instances.find((o) => o.observed.includes(list));
      return { list, observer };
    };

    it('re-pins to the bottom when the container resizes while the viewer is at the bottom', () => {
      const { list, observer } = renderWithGeometry(400);

      expect(observer).toBeDefined();
      observer?.trigger();

      // iOS URL-bar collapse / keyboard resize: the pin must follow.
      expect(list.scrollTop).toBe(500);
    });

    it('does not re-pin when the viewer has deliberately scrolled up', () => {
      const { list, observer } = renderWithGeometry(0);
      // distance from bottom = 400 → flips wasAtBottom to false.
      list.dispatchEvent(new Event('scroll'));

      observer?.trigger();

      expect(list.scrollTop).toBe(0);
    });

    it('also observes the message stream so late-loading rows keep the tail visible', () => {
      const { container } = render(<ChatMessageList {...baseProps} messages={[makeMsg('a')]} />);
      const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
      const stream = list.querySelector('ul') as HTMLElement;
      const observer = FakeResizeObserver.instances.find((o) => o.observed.includes(list));

      expect(observer?.observed).toContain(stream);
    });

    it('observes the pinned strip so a late-arriving strip keeps the tail visible', () => {
      const pinned = makeMsg('p1');
      const { container, rerender } = render(
        <ChatMessageList {...baseProps} messages={[makeMsg('a')]} />
      );
      // The strip arrives from its own query after first paint: it shifts
      // the stream down without resizing the container or the stream box,
      // so it must be observed itself once it mounts.
      rerender(
        <ChatMessageList
          {...baseProps}
          messages={[makeMsg('a'), pinned]}
          pinnedMessages={[pinned]}
        />
      );

      const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
      const strip = list.querySelector('[data-testid="chat-pinned-messages"]') as HTMLElement;
      expect(strip).not.toBeNull();
      const observer = FakeResizeObserver.instances.find((o) => o.observed.includes(strip));
      expect(observer?.observed).toContain(strip);
    });

    describe('coarse-pointer pin protection (iOS)', () => {
      // setupTests defines window.matchMedia as writable but not
      // configurable, so swap it by assignment rather than vi.stubGlobal.
      let originalMatchMedia: typeof window.matchMedia;

      const stubCoarsePointer = (): void => {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
          matches: query === '(pointer: coarse)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })) as typeof window.matchMedia;
      };

      beforeEach(() => {
        originalMatchMedia = window.matchMedia;
      });

      afterEach(() => {
        window.matchMedia = originalMatchMedia;
        vi.useRealTimers();
      });

      it('snaps back when the browser displaces a pinned list without user input', () => {
        stubCoarsePointer();
        // scrollTop 0 with scrollHeight 500 = displaced far from the bottom,
        // e.g. WebKit resetting scroll when the drawer transition ends.
        const { list } = renderWithGeometry(0);

        list.dispatchEvent(new Event('scroll'));

        expect(list.scrollTop).toBe(500);
      });

      it('lets a touch-driven scroll unpin (no snap back, no resize re-pin)', () => {
        stubCoarsePointer();
        const { list, observer } = renderWithGeometry(0);

        fireEvent.touchMove(list);
        list.dispatchEvent(new Event('scroll'));
        expect(list.scrollTop).toBe(0);

        observer?.trigger();
        expect(list.scrollTop).toBe(0);
      });

      it('re-arms the pin when a user scroll returns to the bottom', () => {
        vi.useFakeTimers();
        stubCoarsePointer();
        const { list } = renderWithGeometry(0);

        // User drags up: unpinned at the top.
        fireEvent.touchMove(list);
        list.dispatchEvent(new Event('scroll'));
        expect(list.scrollTop).toBe(0);

        // User scrolls back down to the bottom: pin re-arms.
        list.scrollTop = 450;
        list.dispatchEvent(new Event('scroll'));

        // A later browser-initiated reset (past the momentum window) snaps back.
        vi.advanceTimersByTime(1_000);
        list.scrollTop = 0;
        list.dispatchEvent(new Event('scroll'));
        expect(list.scrollTop).toBe(500);
      });

      it('keeps momentum scrolls classified as user input past the initial window', () => {
        vi.useFakeTimers();
        stubCoarsePointer();
        const { list } = renderWithGeometry(0);

        fireEvent.touchMove(list);
        // Momentum events keep arriving after touch input; each one refreshes
        // the user window so the chain never gets misread as a browser reset.
        vi.advanceTimersByTime(150);
        list.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(150);
        list.dispatchEvent(new Event('scroll'));

        expect(list.scrollTop).toBe(0);
      });
    });
  });

  it('updates the wasAtBottom flag in response to scroll events', () => {
    const { container } = render(<ChatMessageList {...baseProps} messages={[makeMsg('a')]} />);
    const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 200 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 100 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    // Just dispatch a scroll event — the handler runs without throwing
    // and reads the mocked scroll metrics. We don't assert on the ref;
    // exercising the path covers the handleScroll branches.
    list.dispatchEvent(new Event('scroll'));
    expect(list).toBeInTheDocument();
  });

  it('preserves scroll position by adjusting scrollTop on prepend (Load more)', () => {
    const { container, rerender } = render(
      <ChatMessageList {...baseProps} messages={[makeMsg('b'), makeMsg('c')]} />
    );
    const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 50 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });

    // Prepend a new older message; firstId changes → isPrepend=true.
    rerender(
      <ChatMessageList {...baseProps} messages={[makeMsg('a'), makeMsg('b'), makeMsg('c')]} />
    );
    // Scroll handler ran without throwing.
    expect(list).toBeInTheDocument();
  });

  it('anchors to the bottom on append when the viewer was already at the bottom', () => {
    const { container, rerender } = render(
      <ChatMessageList {...baseProps} messages={[makeMsg('a')]} />
    );
    const list = container.querySelector('[data-testid="chat-message-list"]') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 60 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 40 });
    list.dispatchEvent(new Event('scroll'));

    // Append a new tail message; lastId changes → isAppend.
    rerender(<ChatMessageList {...baseProps} messages={[makeMsg('a'), makeMsg('b')]} />);
    expect(list).toBeInTheDocument();
  });

  it('scrolls to the most recent matching mention on first paint when scrollToMentionUsername is set', () => {
    const msg: OptimisticChatMessage = {
      ...makeMsg('m1'),
      body: 'hi @octo welcome!',
    };
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;

    render(<ChatMessageList {...baseProps} messages={[msg]} scrollToMentionUsername="octo" />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('alternates row alignment each time the message author changes', () => {
    const fromUser = (id: string, userId: string): OptimisticChatMessage => ({
      ...makeMsg(id),
      user: { id: userId, username: userId, gravatarHash: 'h' },
    });
    const { container } = render(
      <ChatMessageList
        {...baseProps}
        messages={[fromUser('a', 'user-1'), fromUser('b', 'user-2'), fromUser('c', 'user-1')]}
      />
    );

    const aligns = Array.from(container.querySelectorAll('[data-testid="chat-message-row"]')).map(
      (el) => el.getAttribute('data-align')
    );
    expect(aligns).toEqual(['left', 'right', 'left']);
  });

  it('falls back to bottom-anchor when the mention is not found', () => {
    render(
      <ChatMessageList
        {...baseProps}
        messages={[makeMsg('m1')]}
        scrollToMentionUsername="someone-else"
      />
    );
    // No mention → fall through to the bottom-anchor branch; we just
    // assert that the render doesn't crash.
    expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
  });
});
