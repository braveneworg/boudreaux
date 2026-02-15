/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Combobox } from './combobox';

// Mock scrollIntoView for JSDOM
Element.prototype.scrollIntoView = vi.fn();

const mockOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

describe('Combobox', () => {
  const mockOnSelectAction = vi.fn();

  beforeEach(() => {
    mockOnSelectAction.mockClear();
  });

  it('renders with default selected value', () => {
    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    // Should show first option label by default
    expect(screen.getByRole('combobox')).toHaveTextContent('Option 1');
  });

  it('renders with custom className', () => {
    render(
      <Combobox
        options={mockOptions}
        onSelectAction={mockOnSelectAction}
        className="custom-class"
      />
    );

    expect(screen.getByRole('combobox')).toHaveClass('custom-class');
  });

  it('has combobox role with aria-expanded attribute', () => {
    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens popover on click', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    expect(combobox).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows all options when opened', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    await user.click(screen.getByRole('combobox'));

    // Options should appear as options in the listbox
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('shows search input with placeholder', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByPlaceholderText('Select a section')).toBeInTheDocument();
  });

  it('calls onSelectAction when option is selected', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    await user.click(screen.getByRole('combobox'));

    // Find and click on Option 2 (using data-value or text)
    const option2 = screen.getByRole('option', { name: /Option 2/i });
    await user.click(option2);

    expect(mockOnSelectAction).toHaveBeenCalledWith('option2');
  });

  it('updates displayed value when option is selected', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    const option2 = screen.getByRole('option', { name: /Option 2/i });
    await user.click(option2);

    // After selection, combobox should show Option 2
    expect(screen.getByRole('combobox')).toHaveTextContent('Option 2');
  });

  it('closes popover after selection', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    const option2 = screen.getByRole('option', { name: /Option 2/i });
    await user.click(option2);

    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows check icon for selected option', async () => {
    const user = userEvent.setup();

    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    await user.click(screen.getByRole('combobox'));

    // First option should be selected by default, so check icon should be visible
    // The check icon for Option 1 should have opacity-100
    const option1Element = screen.getByRole('option', { name: /Option 1/i });
    const checkIcon = option1Element.querySelector('svg.opacity-100, svg[class*="opacity-100"]');
    expect(checkIcon).toBeInTheDocument();
  });

  it('renders chevron icon', () => {
    render(<Combobox options={mockOptions} onSelectAction={mockOnSelectAction} />);

    // Chevron icon should be present in the button
    const combobox = screen.getByRole('combobox');
    const svgIcon = combobox.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();
  });
});
