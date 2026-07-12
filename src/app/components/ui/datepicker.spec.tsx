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

  it('commits onSelect when a full valid date is typed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DatePicker fieldName="releasedOn" onSelect={onSelect} />);

    await user.type(screen.getByRole('textbox'), '05122023');

    const [iso, field] = (onSelect.mock.calls.at(-1) ?? ['', '']) as [string, string];
    const picked = new Date(iso);
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate(), field]).toEqual([
      2023,
      4,
      12,
      'releasedOn',
    ]);
  });

  it('does not call onSelect while the typed date is incomplete', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DatePicker fieldName="releasedOn" onSelect={onSelect} />);

    await user.type(screen.getByRole('textbox'), '0512');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reverts to the last valid date when an incomplete entry is blurred', async () => {
    const user = userEvent.setup();
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '0512');
    await user.tab();

    expect(input).toHaveValue('07/15/2026');
  });

  it('commits a clear when an emptied field is blurred', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DatePicker fieldName="publishedAt" value="2026-07-15" onSelect={onSelect} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.tab();

    expect(onSelect).toHaveBeenCalledWith('', 'publishedAt');
  });

  it('offers a year dropdown spanning 1900 to 2099', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<DatePicker fieldName="releasedOn" value="2026-07-15" />);

    await user.click(screen.getByRole('button', { name: /open calendar/i }));
    await screen.findByRole('grid');

    expect(screen.getByRole('option', { name: '1900' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2099' })).toBeInTheDocument();
  });
});
