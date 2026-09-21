/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RemovablePill } from './removable-pill';

describe('RemovablePill', () => {
  it('renders the label', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} />);

    expect(screen.getByText('Indie Rock')).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onRemove = vi.fn();
    render(<RemovablePill label="Indie Rock" onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove Indie Rock' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('labels the remove button with the pill label', () => {
    render(<RemovablePill label="Post Punk" onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remove Post Punk' })).toBeInTheDocument();
  });

  it('renders the remove control as a non-submitting button', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remove Indie Rock' })).toHaveAttribute(
      'type',
      'button'
    );
  });

  it('disables the remove button when disabled', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Remove Indie Rock' })).toBeDisabled();
  });

  it('does not call onRemove while disabled', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onRemove = vi.fn();
    render(<RemovablePill label="Indie Rock" onRemove={onRemove} disabled />);

    await user.click(screen.getByRole('button', { name: 'Remove Indie Rock' }));

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('renders the leading slot before the label', () => {
    render(
      <RemovablePill
        label="Indie Rock"
        onRemove={vi.fn()}
        leading={<span data-testid="drag-handle" />}
      />
    );

    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
  });

  it('omits the leading slot when none is given', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} />);

    expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument();
  });

  it('dims the pill when muted', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} muted data-testid="pill" />);

    expect(screen.getByTestId('pill')).toHaveClass('opacity-60');
  });

  it('does not dim the pill by default', () => {
    render(<RemovablePill label="Indie Rock" onRemove={vi.fn()} data-testid="pill" />);

    expect(screen.getByTestId('pill')).not.toHaveClass('opacity-60');
  });
});
