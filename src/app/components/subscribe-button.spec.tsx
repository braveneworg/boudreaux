/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { SubscribeButton } from './subscribe-button';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('SubscribeButton', () => {
  it('should render the subscribe message', () => {
    render(<SubscribeButton subscribeMessage="Subscribe" />);

    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
  });

  it('should render with custom subscribe message', () => {
    render(<SubscribeButton subscribeMessage="Join Now" />);

    expect(screen.getByRole('button', { name: 'Join Now' })).toBeInTheDocument();
  });

  it('should navigate to /subscribe when clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<SubscribeButton subscribeMessage="Subscribe" />);

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(mockPush).toHaveBeenCalledWith('/subscribe');
  });

  it('should call onClick handler when provided', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<SubscribeButton subscribeMessage="Subscribe" onClick={handleClick} />);

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/subscribe');
  });

  it('should navigate even without onClick handler', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<SubscribeButton subscribeMessage="Subscribe" />);

    await user.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(mockPush).toHaveBeenCalledWith('/subscribe');
  });
});
