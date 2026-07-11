/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DatePicker } from './datepicker';

describe('DatePicker', () => {
  it('renders the controlled value formatted as MM/dd/yyyy', () => {
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" />);

    expect(screen.getByRole('textbox')).toHaveValue('07/15/2026');
  });

  it('keeps the calendar closed until the trigger is clicked', () => {
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" />);

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('opens the calendar when the calendar button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" />);

    await user.click(screen.getByRole('button', { name: /open calendar/i }));

    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });
  });

  it('calls onSelect with the picked day and closes the calendar', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /open calendar/i }));
    await user.click(await screen.findByRole('button', { name: /july 20th, 2026/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [isoString, fieldName] = onSelect.mock.calls[0] as [string, string];
    expect(fieldName).toBe('releasedOn');
    const picked = new Date(isoString);
    expect(picked.getFullYear()).toBe(2026);
    expect(picked.getMonth()).toBe(6);
    expect(picked.getDate()).toBe(20);
    await waitFor(() => {
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    });
  });

  it('clears the date via the Clear button and closes the calendar', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    render(<DatePicker fieldName="publishedAt" value="2026-07-15" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /open calendar/i }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));

    expect(onSelect).toHaveBeenCalledWith('', 'publishedAt');
    await waitFor(() => {
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    });
  });
});
