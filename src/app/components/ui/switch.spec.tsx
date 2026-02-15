/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Switch } from './switch';

describe('Switch', () => {
  it('renders', () => {
    render(<Switch aria-label="Toggle" />);

    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(<Switch aria-label="Toggle" data-testid="switch" />);

    expect(screen.getByTestId('switch')).toHaveAttribute('data-slot', 'switch');
  });

  it('applies custom className', () => {
    render(<Switch aria-label="Toggle" data-testid="switch" className="custom-class" />);

    expect(screen.getByTestId('switch')).toHaveClass('custom-class');
  });

  it('can be toggled on', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" />);

    const switchEl = screen.getByRole('switch');

    expect(switchEl).toHaveAttribute('data-state', 'unchecked');

    await user.click(switchEl);

    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });

  it('can be toggled off', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" defaultChecked />);

    const switchEl = screen.getByRole('switch');

    expect(switchEl).toHaveAttribute('data-state', 'checked');

    await user.click(switchEl);

    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });

  it('supports controlled state', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Toggle" checked={false} onCheckedChange={onCheckedChange} />);

    const switchEl = screen.getByRole('switch');

    await userEvent.click(switchEl);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('can be disabled', async () => {
    render(<Switch aria-label="Toggle" disabled />);

    const switchEl = screen.getByRole('switch');

    expect(switchEl).toBeDisabled();
    expect(switchEl).toHaveAttribute('data-disabled');
  });

  it('renders thumb element', () => {
    render(<Switch aria-label="Toggle" />);

    expect(document.querySelector('[data-slot="switch-thumb"]')).toBeInTheDocument();
  });

  it('passes additional props', () => {
    render(<Switch aria-label="Toggle notifications" id="notifications-switch" />);

    const switchEl = screen.getByRole('switch');

    expect(switchEl).toHaveAttribute('aria-label', 'Toggle notifications');
    expect(switchEl).toHaveAttribute('id', 'notifications-switch');
  });

  it('toggles via keyboard', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" />);

    const switchEl = screen.getByRole('switch');
    switchEl.focus();

    expect(switchEl).toHaveAttribute('data-state', 'unchecked');

    await user.keyboard(' ');

    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });
});
