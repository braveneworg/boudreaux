// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen } from '@testing-library/react';

import { ChatDrawer } from './chat-drawer';

const useIsMobileMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

beforeEach(() => useIsMobileMock.mockReset());

const renderDrawer = (overrides?: Partial<React.ComponentProps<typeof ChatDrawer>>) => {
  const onOpenChange = vi.fn();
  render(
    <ChatDrawer open onOpenChange={onOpenChange} {...overrides}>
      <div data-testid="chat-body">body content</div>
    </ChatDrawer>
  );
  return { onOpenChange };
};

describe('ChatDrawer', () => {
  it('renders the title and body when open', () => {
    useIsMobileMock.mockReturnValue(false);
    renderDrawer();

    expect(screen.getByRole('img', { name: /live chat/i })).toHaveAttribute('alt', 'live chat');
    expect(screen.getByTestId('chat-body')).toBeInTheDocument();
  });

  it('renders a close button with an accessible label', () => {
    useIsMobileMock.mockReturnValue(false);
    renderDrawer();
    expect(screen.getByRole('button', { name: /close chat/i })).toBeInTheDocument();
  });

  it('fires onOpenChange(false) when the close button is clicked', () => {
    useIsMobileMock.mockReturnValue(false);
    const { onOpenChange } = renderDrawer();

    // fireEvent.click avoids userEvent's pointerdown/pointerup
    // sequence, which Vaul intercepts and where jsdom's missing
    // `style.transform` value crashes the close transition.
    fireEvent.click(screen.getByRole('button', { name: /close chat/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render the drawer body when open=false', () => {
    useIsMobileMock.mockReturnValue(false);
    const onOpenChange = vi.fn();
    render(
      <ChatDrawer open={false} onOpenChange={onOpenChange}>
        <div data-testid="chat-body">body</div>
      </ChatDrawer>
    );

    expect(screen.queryByTestId('chat-body')).not.toBeInTheDocument();
  });

  it('renders the accessible description for screen readers', () => {
    useIsMobileMock.mockReturnValue(false);
    renderDrawer();

    expect(
      screen.getByText(/Real-time chat with other Fake Four Inc\. listeners and the label team\./i)
    ).toBeInTheDocument();
  });

  it('carries the orchid zine accent and punk border on the drawer content', () => {
    useIsMobileMock.mockReturnValue(false);
    renderDrawer();

    // Vaul portals the content into document.body, outside the render container.
    expect(document.querySelector('[data-slot="drawer-content"]')).toHaveClass(
      'zine-accent-orchid',
      'border-2',
      'border-black'
    );
  });

  describe('drawer direction', () => {
    it('slides up from the bottom on mobile', () => {
      useIsMobileMock.mockReturnValue(true);
      renderDrawer();

      expect(document.querySelector('[data-vaul-drawer-direction]')).toHaveAttribute(
        'data-vaul-drawer-direction',
        'bottom'
      );
    });

    it('slides in from the right on desktop', () => {
      useIsMobileMock.mockReturnValue(false);
      renderDrawer();

      expect(document.querySelector('[data-vaul-drawer-direction]')).toHaveAttribute(
        'data-vaul-drawer-direction',
        'right'
      );
    });
  });
});
