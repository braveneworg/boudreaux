/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ArtistSearchCombobox } from './artist-search-combobox';

// ---------------------------------------------------------------------------
// Mock: useArtistListQuery
// ---------------------------------------------------------------------------
const mockUseArtistListQuery = vi.fn();
vi.mock('@/app/hooks/use-artist-list-query', () => ({
  useArtistListQuery: (...args: unknown[]): unknown => mockUseArtistListQuery(...args),
}));

// ---------------------------------------------------------------------------
// Mock: useDebounce — pass-through so tests don't need fake timers
// ---------------------------------------------------------------------------
vi.mock('@/app/hooks/use-debounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// ---------------------------------------------------------------------------
// Mock: shadcn UI primitives
// ---------------------------------------------------------------------------
let mockPopoverOpen = false;

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mockPopoverOpen = open ?? false;
    return (
      <div data-testid="popover" data-open={open}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ onOpenChange?: (open: boolean) => void }>,
                { onOpenChange }
              )
            : child
        )}
        <button
          data-testid="popover-close-trigger"
          onClick={() => onOpenChange?.(false)}
          style={{ display: 'none' }}
        >
          Close
        </button>
      </div>
    );
  },
  PopoverTrigger: ({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="popover-trigger"
      onClick={() => onOpenChange?.(!mockPopoverOpen)}
      onKeyDown={(e) => e.key === 'Enter' && onOpenChange?.(!mockPopoverOpen)}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  ),
  PopoverContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
    avoidCollisions?: boolean;
    collisionPadding?: number;
    sideOffset?: number;
    onEscapeKeyDown?: (e: { stopPropagation: () => void }) => void;
  }) =>
    mockPopoverOpen ? (
      <div data-testid="popover-content" className={className}>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    role,
    onClick,
    disabled,
    ...rest
  }: {
    children?: React.ReactNode;
    role?: string;
    onClick?: () => void;
    disabled?: boolean;
  } & Record<string, unknown>) => (
    <button
      data-testid="combobox-trigger"
      role={role}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/command', () => ({
  Command: ({ children, shouldFilter }: { children: React.ReactNode; shouldFilter?: boolean }) => (
    <div data-testid="command" data-should-filter={shouldFilter}>
      {children}
    </div>
  ),
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
    onKeyDown,
  }: {
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  }) => (
    <input
      data-testid="command-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      onKeyDown={onKeyDown}
    />
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-group">{children}</div>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-list">{children}</div>
  ),
  CommandItem: ({
    children,
    value,
    onSelect,
  }: {
    children: React.ReactNode;
    value?: string;
    onSelect?: () => void;
  }) => (
    <div
      data-testid={`command-item-${value}`}
      data-value={value}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
      role="option"
      aria-selected={false}
      tabIndex={0}
    >
      {children}
    </div>
  ),
}));

vi.mock('lucide-react', () => ({
  ChevronsUpDown: () => <span data-testid="chevrons-icon" />,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockArtists = [
  {
    id: 'a1',
    displayName: 'Real Artist',
    firstName: 'Real',
    surname: 'Artist',
    slug: 'real-artist',
  },
  {
    id: 'a2',
    displayName: null,
    firstName: 'John',
    surname: 'Doe',
    slug: 'john-doe',
  },
];

const defaultQueryResult = {
  isPending: false,
  error: new Error('Unknown error'),
  data: mockArtists,
  refetch: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArtistSearchCombobox', () => {
  beforeEach(() => {
    mockPopoverOpen = false;
    mockUseArtistListQuery.mockReturnValue(defaultQueryResult);
  });

  it('selects an existing artist by display name', async () => {
    const onChange = vi.fn();
    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    // Open the combobox
    await userEvent.click(screen.getByRole('combobox'));

    // Type in search field
    await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'real');

    // Click the matching result
    await userEvent.click(await screen.findByText('Real Artist'));

    expect(onChange).toHaveBeenCalledWith('Real Artist');
  });

  it('accepts a free-text primary artist via Enter', async () => {
    const onChange = vi.fn();
    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'Nobody Known{Enter}');

    expect(onChange).toHaveBeenCalledWith('Nobody Known');
  });

  it('shows the current value in the trigger', () => {
    render(<ArtistSearchCombobox value="Existing Name" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Existing Name');
  });

  it('shows placeholder when value is empty', () => {
    render(
      <ArtistSearchCombobox value="" onChange={vi.fn()} placeholder="Select primary artist…" />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Select primary artist…');
  });

  it('shows label when provided', () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} label="Primary Artist" />);
    expect(screen.getByText('Primary Artist')).toBeInTheDocument();
  });

  it('label is programmatically associated with the combobox trigger', () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} label="Artist / Creator" />);
    // getByRole finds the trigger by its accessible name from the label
    expect(screen.getByRole('combobox', { name: 'Artist / Creator' })).toBeInTheDocument();
  });

  it('does not render a label element when label prop is absent', () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('label')).not.toBeInTheDocument();
    // No label text rendered at all
    expect(document.querySelector('label')).toBeNull();
  });

  it('disables the trigger when disabled prop is true', () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders artist with firstName+surname when displayName is null', async () => {
    const onChange = vi.fn();
    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByTestId('command-item-a2')).toHaveTextContent('John Doe');
    });
  });

  it('selects artist with null displayName using firstName+surname', async () => {
    const onChange = vi.fn();
    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByTestId('command-item-a2')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('command-item-a2'));
    expect(onChange).toHaveBeenCalledWith('John Doe');
  });

  it('accepts free-text via "Use <name>" item click', async () => {
    const onChange = vi.fn();
    // Mock empty results so "Use" item appears
    mockUseArtistListQuery.mockReturnValue({
      ...defaultQueryResult,
      data: [],
    });

    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'Brand New');

    // Click the "Use" item
    const useItem = await screen.findByText(/Use "Brand New"/);
    await userEvent.click(useItem);

    expect(onChange).toHaveBeenCalledWith('Brand New');
  });

  it('does not show "Use <name>" item when search exactly matches a result', async () => {
    const onChange = vi.fn();
    render(<ArtistSearchCombobox value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole('combobox'));
    // "Real Artist" exactly matches a result — Use item should not appear
    await userEvent.type(screen.getByPlaceholderText(/search artists/i), 'Real Artist');

    await waitFor(() => {
      expect(screen.queryByText(/^Use "/)).not.toBeInTheDocument();
    });
  });

  it('shows loading state while query is pending', async () => {
    mockUseArtistListQuery.mockReturnValue({
      ...defaultQueryResult,
      isPending: true,
      data: undefined,
    });

    render(<ArtistSearchCombobox value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  it('passes enabled:open to the query hook', async () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} />);

    // Before opening: query called with enabled:false
    const callsBefore = mockUseArtistListQuery.mock.calls.length;
    expect(mockUseArtistListQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false })
    );

    // Open popover
    await userEvent.click(screen.getByRole('combobox'));

    // After opening: query called with enabled:true
    expect(mockUseArtistListQuery.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockUseArtistListQuery).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: true })
    );
  });

  it('uses shouldFilter={false} on Command', async () => {
    render(<ArtistSearchCombobox value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByTestId('command')).toHaveAttribute('data-should-filter', 'false');
    });
  });
});
