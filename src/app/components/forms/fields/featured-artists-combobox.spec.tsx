/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FeaturedArtistsCombobox } from './featured-artists-combobox';

// --------------------------------------------------------------------------
// Mock: useArtistListQuery
// --------------------------------------------------------------------------
interface MockArtistRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  surname: string;
  slug: string;
}

let mockArtistResults: MockArtistRow[] = [];
let mockIsPending = false;
let mockDataUndefined = false;

vi.mock('@/app/hooks/use-artist-list-query', () => ({
  useArtistListQuery: () => ({
    isPending: mockIsPending,
    error: null,
    data: mockDataUndefined ? undefined : mockArtistResults,
    refetch: vi.fn(),
  }),
}));

// --------------------------------------------------------------------------
// Mock: useDebounce (return value immediately — no timer tricks needed)
// --------------------------------------------------------------------------
vi.mock('@/app/hooks/use-debounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// --------------------------------------------------------------------------
// Mock: lucide-react icons
// --------------------------------------------------------------------------
vi.mock('lucide-react', () => ({
  ChevronsUpDown: () => <span data-testid="chevrons-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

// --------------------------------------------------------------------------
// Mock: shadcn/ui — Button
// --------------------------------------------------------------------------
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
    <button role={role} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

// --------------------------------------------------------------------------
// Mock: shadcn/ui — Badge
// --------------------------------------------------------------------------
vi.mock('@/app/components/ui/badge', () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children?: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

// --------------------------------------------------------------------------
// Mock: shadcn/ui — Popover (stateful so Command + trigger work together)
// --------------------------------------------------------------------------
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
      </div>
    );
  },
  PopoverTrigger: ({
    children,
    asChild: _asChild,
    onOpenChange,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="popover-trigger"
      onClick={() => onOpenChange?.(!mockPopoverOpen)}
      onKeyDown={() => onOpenChange?.(!mockPopoverOpen)}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  ),
  PopoverContent: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    mockPopoverOpen ? (
      <div data-testid="popover-content" className={className}>
        {children}
      </div>
    ) : null,
}));

// --------------------------------------------------------------------------
// Mock: shadcn/ui — Command
// --------------------------------------------------------------------------
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
    onSelect,
  }: {
    children: React.ReactNode;
    value?: string;
    onSelect?: () => void;
  }) => (
    <div
      data-testid="command-item"
      onClick={onSelect}
      onKeyDown={onSelect}
      role="option"
      aria-selected={false}
      tabIndex={0}
    >
      {children}
    </div>
  ),
}));

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
const setup = (props: {
  value?: string[];
  onChange?: (next: string[]) => void;
  label?: string;
  disabled?: boolean;
}) => {
  const onChange = props.onChange ?? vi.fn<(next: string[]) => void>();
  render(
    <FeaturedArtistsCombobox
      value={props.value ?? []}
      onChange={onChange}
      label={props.label}
      disabled={props.disabled}
    />
  );
  return { onChange };
};

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe('FeaturedArtistsCombobox', () => {
  beforeEach(() => {
    mockPopoverOpen = false;
    mockArtistResults = [];
    mockIsPending = false;
    mockDataUndefined = false;
  });

  describe('adds a featured artist from search results', () => {
    it('calls onChange with the selected artist name string', async () => {
      mockArtistResults = [
        {
          id: 'a1',
          displayName: 'Real Artist',
          firstName: null,
          surname: 'Artist',
          slug: 'real-artist',
        },
      ];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search featured artists/i), 'real');

      const item = await screen.findByText('Real Artist');
      await userEvent.click(item);

      expect(onChange).toHaveBeenCalledWith(['Real Artist']);
    });
  });

  describe('adds a free-text featured artist on Enter', () => {
    it('calls onChange with the free-text name when Enter is pressed with no exact match', async () => {
      mockArtistResults = [];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search featured artists/i);
      await userEvent.type(input, 'Guest');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith(['Guest']);
    });

    it('uses the matched result display name when Enter exactly matches a result', async () => {
      mockArtistResults = [
        {
          id: 'a1',
          displayName: 'Real Artist',
          firstName: null,
          surname: 'Artist',
          slug: 'real-artist',
        },
      ];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search featured artists/i);
      await userEvent.type(input, 'real artist');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith(['Real Artist']);
    });

    it('calls onChange with name when "Add" item is clicked', async () => {
      mockArtistResults = [];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search featured artists/i), 'Guest MC');

      const addItem = await screen.findByText(/Add "Guest MC"/i);
      await userEvent.click(addItem);

      expect(onChange).toHaveBeenCalledWith(['Guest MC']);
    });
  });

  describe('removes a featured pill', () => {
    it('calls onChange with the pill removed when X is clicked', async () => {
      const { onChange } = setup({ value: ['Guest'] });
      await userEvent.click(screen.getByLabelText('Remove Guest'));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('renders removable pills for each value entry', () => {
      setup({ value: ['Artist One', 'Artist Two'] });
      expect(screen.getByLabelText('Remove Artist One')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove Artist Two')).toBeInTheDocument();
    });

    it('removes only the targeted pill when multiple are present', async () => {
      const { onChange } = setup({ value: ['Artist One', 'Artist Two'] });
      await userEvent.click(screen.getByLabelText('Remove Artist One'));
      expect(onChange).toHaveBeenCalledWith(['Artist Two']);
    });
  });

  describe('disabled state', () => {
    it('shows the hint "Add a primary artist first" when disabled', () => {
      render(<FeaturedArtistsCombobox value={[]} onChange={vi.fn()} disabled />);
      expect(screen.getByText(/add a primary artist first/i)).toBeInTheDocument();
    });

    it('disables the trigger button when disabled prop is true', () => {
      setup({ value: [], disabled: true });
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('de-duplication', () => {
    it('ignores a result add that duplicates an existing pill (case-insensitive)', async () => {
      mockArtistResults = [
        {
          id: 'a1',
          displayName: 'Real Artist',
          firstName: null,
          surname: 'Artist',
          slug: 'real-artist',
        },
      ];
      const { onChange } = setup({ value: ['Real Artist'] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search featured artists/i), 'real artist');
      const item = await screen.findByRole('option', { name: 'Real Artist' });
      await userEvent.click(item);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores a free-text add that duplicates an existing pill (case-insensitive)', async () => {
      mockArtistResults = [];
      const { onChange } = setup({ value: ['Guest'] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search featured artists/i);
      await userEvent.type(input, 'guest');
      await userEvent.keyboard('{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('label', () => {
    it('renders the label when provided', () => {
      setup({ value: [], label: 'Featured Artists' });
      expect(screen.getByText('Featured Artists')).toBeInTheDocument();
    });

    it('label is programmatically associated with the combobox trigger', () => {
      setup({ value: [], label: 'Featured Artists' });
      expect(screen.getByRole('combobox', { name: 'Featured Artists' })).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows a loading message while isPending is true', async () => {
      mockIsPending = true;
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('query returns no data', () => {
    it('renders the empty-results message when data is undefined', async () => {
      mockDataUndefined = true;
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      expect(await screen.findByText(/no artists found/i)).toBeInTheDocument();
    });
  });

  describe('search reset and empty Enter', () => {
    it('clears the search when the popover closes', async () => {
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search featured artists/i);
      await userEvent.type(input, 'Guest');
      expect(input).toHaveValue('Guest');

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.click(screen.getByRole('combobox'));
      expect(screen.getByPlaceholderText(/search featured artists/i)).toHaveValue('');
    });

    it('ignores Enter when the search field is empty', async () => {
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search featured artists/i), '{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
