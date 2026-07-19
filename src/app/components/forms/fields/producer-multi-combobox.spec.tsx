/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProducerMultiCombobox } from './producer-multi-combobox';

import type { ProducerPill } from './producer-multi-combobox';

// --------------------------------------------------------------------------
// Mock: useProducersSearchQuery
// --------------------------------------------------------------------------
let mockProducerResults: ProducerPill[] = [];
let mockIsPending = false;
let mockDataUndefined = false;

vi.mock('../_hooks/use-producers-search-query', () => ({
  useProducersSearchQuery: () => ({
    isPending: mockIsPending,
    error: null,
    data: mockDataUndefined ? undefined : mockProducerResults,
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
  value?: ProducerPill[];
  onChange?: (next: ProducerPill[]) => void;
  label?: string;
  disabled?: boolean;
}) => {
  const onChange = props.onChange ?? vi.fn<(next: ProducerPill[]) => void>();
  render(
    <ProducerMultiCombobox
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
describe('ProducerMultiCombobox', () => {
  beforeEach(() => {
    mockPopoverOpen = false;
    mockProducerResults = [];
    mockIsPending = false;
    mockDataUndefined = false;
  });

  describe('adds existing producer from search results', () => {
    it('calls onChange with the selected producer object including id', async () => {
      mockProducerResults = [{ id: 'p1', name: 'Rick' }];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search producers/i), 'rick');

      const item = await screen.findByText('Rick');
      await userEvent.click(item);

      expect(onChange).toHaveBeenCalledWith([{ id: 'p1', name: 'Rick' }]);
    });
  });

  describe('adds matched producer via Enter when exact search result exists', () => {
    it('calls onChange with the matched result pill (with id) when Enter matches a search result', async () => {
      mockProducerResults = [{ id: 'p1', name: 'Rick' }];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'Rick');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith([{ id: 'p1', name: 'Rick' }]);
    });

    it('match is case-insensitive (lowercase input → matched result pill with id)', async () => {
      mockProducerResults = [{ id: 'p1', name: 'Rick' }];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'rick');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith([{ id: 'p1', name: 'Rick' }]);
    });
  });

  describe('adds a new free-text producer with no id', () => {
    it('calls onChange with a pill containing only name when Enter is pressed with no exact match', async () => {
      mockProducerResults = [];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'Brand New');
      await userEvent.keyboard('{Enter}');

      expect(onChange).toHaveBeenCalledWith([{ name: 'Brand New' }]);
    });

    it('calls onChange with a pill containing only name when "Add" item is clicked', async () => {
      mockProducerResults = [];
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'New Guy');

      const addItem = await screen.findByText(/Add "New Guy"/i);
      await userEvent.click(addItem);

      expect(onChange).toHaveBeenCalledWith([{ name: 'New Guy' }]);
    });
  });

  describe('pill rendering and removal', () => {
    it('renders removable pills for each value entry', () => {
      setup({ value: [{ id: 'p1', name: 'Rick' }] });
      expect(screen.getByLabelText('Remove Rick')).toBeInTheDocument();
    });

    it('calls onChange with pill removed when X is clicked', async () => {
      const { onChange } = setup({ value: [{ id: 'p1', name: 'Rick' }] });
      await userEvent.click(screen.getByLabelText('Remove Rick'));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('renders multiple pills and removes the correct one', async () => {
      const { onChange } = setup({
        value: [
          { id: 'p1', name: 'Rick' },
          { id: 'p2', name: 'Rubin' },
        ],
      });
      await userEvent.click(screen.getByLabelText('Remove Rick'));
      expect(onChange).toHaveBeenCalledWith([{ id: 'p2', name: 'Rubin' }]);
    });
  });

  describe('"new" pill affordance', () => {
    it('shows a "new" badge for pills without an id', () => {
      setup({ value: [{ name: 'BrandNewProducer' }] });
      const badges = screen.getAllByTestId('badge');
      const texts = badges.map((b) => b.textContent ?? '');
      expect(texts.some((t) => t.includes('new'))).toBe(true);
    });

    it('does not show a "new" badge for pills with an id', () => {
      setup({ value: [{ id: 'p1', name: 'Rick' }] });
      // All badges: the pill name badge + any new badge
      const badges = screen.getAllByTestId('badge');
      // None should contain only "new"
      const newBadges = badges.filter((b) => b.textContent?.trim() === 'new');
      expect(newBadges).toHaveLength(0);
    });
  });

  describe('de-duplication', () => {
    it('ignores a result add that duplicates an existing pill by name (case-insensitive)', async () => {
      mockProducerResults = [{ id: 'p1', name: 'Rick' }];
      const { onChange } = setup({ value: [{ id: 'p1', name: 'Rick' }] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search producers/i), 'rick');
      const item = await screen.findByRole('option', { name: 'Rick' });
      await userEvent.click(item);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores a free-text add that duplicates an existing pill name (case-insensitive)', async () => {
      mockProducerResults = [];
      const { onChange } = setup({ value: [{ id: 'p1', name: 'Rick' }] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'rick');
      await userEvent.keyboard('{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('disables the trigger button when disabled prop is true', () => {
      setup({ value: [], disabled: true });
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('label', () => {
    it('renders the label when provided', () => {
      setup({ value: [], label: 'Producers' });
      expect(screen.getByText('Producers')).toBeInTheDocument();
    });

    it('label is programmatically associated with the combobox trigger', () => {
      setup({ value: [], label: 'Producers' });
      expect(screen.getByRole('combobox', { name: 'Producers' })).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows a loading message while isPending is true', async () => {
      mockIsPending = true;
      mockProducerResults = [];
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('result rows without an id', () => {
    it('renders a search result that has no id (keyed by name)', async () => {
      mockProducerResults = [{ name: 'NoId Producer' }];
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      expect(await screen.findByText('NoId Producer')).toBeInTheDocument();
    });
  });

  describe('query returns no data', () => {
    it('renders the empty-results message when data is undefined', async () => {
      mockDataUndefined = true;
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      expect(await screen.findByText(/no producers found/i)).toBeInTheDocument();
    });
  });

  describe('search reset and empty Enter', () => {
    it('clears the search when the popover closes', async () => {
      setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      const input = screen.getByPlaceholderText(/search producers/i);
      await userEvent.type(input, 'Rick');
      expect(input).toHaveValue('Rick');

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.click(screen.getByRole('combobox'));
      expect(screen.getByPlaceholderText(/search producers/i)).toHaveValue('');
    });

    it('ignores Enter when the search field is empty', async () => {
      const { onChange } = setup({ value: [] });

      await userEvent.click(screen.getByRole('combobox'));
      await userEvent.type(screen.getByPlaceholderText(/search producers/i), '{Enter}');

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
