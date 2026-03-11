/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TourSearch } from './tour-search';

describe('TourSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input with placeholder', () => {
    render(<TourSearch value="" onChange={() => {}} />);

    const input = screen.getByPlaceholderText('Search by artist name...');
    expect(input).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<TourSearch value="" onChange={() => {}} placeholder="Custom placeholder" />);

    const input = screen.getByPlaceholderText('Custom placeholder');
    expect(input).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<TourSearch value="Test Artist" onChange={() => {}} />);

    const input = screen.getByDisplayValue('Test Artist');
    expect(input).toBeInTheDocument();
  });

  it('calls onChange with debounce when typing', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();

    render(<TourSearch value="" onChange={onChange} debounceMs={100} />);

    const input = screen.getByLabelText('Search tours by artist name');

    // Type into input
    await user.type(input, 'Test');

    // onChange should not be called immediately
    expect(onChange).not.toHaveBeenCalled();

    // Wait for debounce (100ms + margin)
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(onChange).toHaveBeenCalledWith('Test');
  });

  it('shows clear button when value is present', () => {
    render(<TourSearch value="Test" onChange={() => {}} />);

    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeInTheDocument();
  });

  it('does not show clear button when value is empty', () => {
    render(<TourSearch value="" onChange={() => {}} />);

    const clearButton = screen.queryByLabelText('Clear search');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();

    render(<TourSearch value="Test Artist" onChange={onChange} />);

    const clearButton = screen.getByLabelText('Clear search');
    await user.click(clearButton);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('respects disabled state', () => {
    render(<TourSearch value="" onChange={() => {}} disabled />);

    const input = screen.getByLabelText('Search tours by artist name');
    expect(input).toBeDisabled();
  });

  it('disables clear button when disabled', () => {
    render(<TourSearch value="Test" onChange={() => {}} disabled />);

    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeDisabled();
  });

  it('syncs local value with prop value', async () => {
    const { rerender } = render(<TourSearch value="Initial" onChange={() => {}} />);

    expect(screen.getByDisplayValue('Initial')).toBeInTheDocument();

    // Update prop value
    rerender(<TourSearch value="Updated" onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Updated')).toBeInTheDocument();
    });
  });

  it('uses custom debounce delay', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();

    render(<TourSearch value="" onChange={onChange} debounceMs={500} />);

    const input = screen.getByLabelText('Search tours by artist name');
    await user.type(input, 'T');

    // Should not be called after 200ms
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).not.toHaveBeenCalled();

    // Should be called after 500ms (advance remaining 350ms)
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(onChange).toHaveBeenCalledWith('T');
  });

  it('has proper ARIA labels for accessibility', () => {
    render(<TourSearch value="Test" onChange={() => {}} />);

    const input = screen.getByLabelText('Search tours by artist name');
    expect(input).toBeInTheDocument();

    const clearButton = screen.getByLabelText('Clear search');
    expect(clearButton).toBeInTheDocument();
  });

  it('maintains focus on input after typing', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<TourSearch value="" onChange={() => {}} />);

    const input = screen.getByLabelText('Search tours by artist name');
    await user.click(input);
    await user.type(input, 'Test');

    expect(input).toHaveFocus();
  });

  it('does not call onChange when debounce fires but local value already matches prop value', async () => {
    const onChange = vi.fn();
    render(<TourSearch value="existing" onChange={onChange} debounceMs={50} />);

    // No user interaction — the initial debounce fires with localValue === value === 'existing'
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
