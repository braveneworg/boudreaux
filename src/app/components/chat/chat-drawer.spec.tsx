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

    expect(screen.getByText('Fake Four Inc. Chat')).toBeInTheDocument();
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
});
