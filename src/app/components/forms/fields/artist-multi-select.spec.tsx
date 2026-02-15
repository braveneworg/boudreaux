/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import ArtistMultiSelect from './artist-multi-select';

import type { Control, UseFormSetValue } from 'react-hook-form';

// Mock the UI components
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (context: {
      field: { value: string[]; onChange: (value: string[]) => void };
    }) => React.ReactNode;
  }) => {
    const [value, setValue] = React.useState<string[]>([]);
    const field = {
      value,
      onChange: (newValue: string[]) => setValue(newValue),
      onBlur: vi.fn(),
      name,
      ref: vi.fn(),
    };
    return <div data-testid={`form-field-${name}`}>{render({ field })}</div>;
  },
  FormItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-item">{children}</div>
  ),
  FormLabel: ({ children }: { children: React.ReactNode }) => (
    <label data-testid="form-label">{children}</label>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-control">{children}</div>
  ),
  FormMessage: () => <div data-testid="form-message" />,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    role,
    onClick,
    disabled,
    ...props
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
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/badge', () => ({
  Badge: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

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
    asChild,
    onOpenChange,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div
      data-testid="popover-trigger"
      data-aschild={asChild}
      onClick={() => onOpenChange?.(!mockPopoverOpen)}
    >
      {children}
    </div>
  ),
  PopoverContent: ({
    children,
    className,
    align,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
  }) =>
    mockPopoverOpen ? (
      <div data-testid="popover-content" className={className} data-align={align}>
        {children}
      </div>
    ) : null,
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
  }: {
    placeholder?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <input
      data-testid="command-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
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
    <div data-testid={`command-item-${value}`} data-value={value} onClick={onSelect}>
      {children}
    </div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a data-testid="create-artist-link" href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon" />,
  ChevronsUpDown: () => <span data-testid="chevrons-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface TestFormValues {
  artistIds: string[];
}

const mockArtists = [
  { id: 'artist-1', displayName: 'Artist One', firstName: 'One', surname: 'Artist' },
  { id: 'artist-2', displayName: 'Artist Two', firstName: 'Two', surname: 'Artist' },
  { id: 'artist-3', displayName: '', firstName: 'Three', surname: 'Artist' },
];

const TestWrapper = ({
  children,
  defaultValues = { artistIds: [] },
}: {
  children: (props: {
    control: Control<TestFormValues>;
    setValue: UseFormSetValue<TestFormValues>;
  }) => React.ReactNode;
  defaultValues?: TestFormValues;
}) => {
  const form = useForm<TestFormValues>({ defaultValues });
  return (
    <FormProvider {...form}>
      {children({ control: form.control, setValue: form.setValue })}
    </FormProvider>
  );
};

describe('ArtistMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPopoverOpen = false;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ artists: mockArtists }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the component with label', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('form-label')).toHaveTextContent('Artists');
    });

    it('renders with custom placeholder', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              placeholder="Choose artists..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Choose artists...');
    });

    it('renders disabled when disabled prop is true', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              disabled
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('combobox-trigger')).toBeDisabled();
    });
  });

  describe('popover behavior', () => {
    it('opens popover when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('popover-content')).toBeInTheDocument();
      });
    });

    it('fetches artists when popover opens', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/artists'));
      });
    });
  });

  describe('search functionality', () => {
    it('renders search input with placeholder', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              searchPlaceholder="Find artists..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toHaveAttribute(
          'placeholder',
          'Find artists...'
        );
      });
    });
  });

  describe('artist display', () => {
    it('displays artist items when loaded', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toBeInTheDocument();
        expect(screen.getByTestId('command-item-artist-2')).toBeInTheDocument();
      });
    });

    it('shows display name when available', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toHaveTextContent('Artist One');
      });
    });

    it('shows firstName surname when displayName is empty', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-3')).toHaveTextContent('Three Artist');
      });
    });
  });

  describe('selection behavior', () => {
    it('shows selected count when artists are selected', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-artist-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('1 artist selected');
    });

    it('shows plural count for multiple selected artists', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-artist-1'));
      await user.click(screen.getByTestId('command-item-artist-2'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('2 artists selected');
    });
  });

  describe('create artist link', () => {
    it('includes returnTo parameter when releaseId is provided', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              releaseId="release-123"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-artist-link');
        const bottomLink = links[links.length - 1];
        expect(bottomLink).toHaveAttribute(
          'href',
          expect.stringContaining('returnTo=%2Fadmin%2Freleases%2Frelease-123')
        );
      });
    });

    it('includes releaseId parameter when releaseId is provided', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              releaseId="release-123"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-artist-link');
        const bottomLink = links[links.length - 1];
        expect(bottomLink).toHaveAttribute(
          'href',
          expect.stringContaining('releaseId=release-123')
        );
      });
    });

    it('has no query params when releaseId is not provided', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-artist-link');
        const bottomLink = links[links.length - 1];
        expect(bottomLink).toHaveAttribute('href', '/admin/artists/new');
      });
    });
  });

  describe('toggle selection', () => {
    it('deselects artist when clicking on already selected item', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toBeInTheDocument();
      });

      // Select
      await user.click(screen.getByTestId('command-item-artist-1'));
      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('1 artist selected');

      // Deselect
      await user.click(screen.getByTestId('command-item-artist-1'));
      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select artists...');
    });
  });

  describe('badge removal', () => {
    it('removes artist when clicking badge remove button', async () => {
      const user = userEvent.setup();
      const mockSetValue = vi.fn();

      render(
        <TestWrapper>
          {({ control }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={mockSetValue}
            />
          )}
        </TestWrapper>
      );

      // Open and select an artist
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-artist-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-artist-1'));

      // Should show badge
      await waitFor(() => {
        expect(screen.getByTestId('badge')).toBeInTheDocument();
      });

      // Click remove button on badge
      const removeButton = screen.getByRole('button', { name: /remove/i });
      await user.click(removeButton);

      // Artist should be removed
      await waitFor(() => {
        expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
      });
    });
  });

  describe('disabled state', () => {
    it('disables trigger button when disabled prop is true', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
              disabled
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('combobox-trigger')).toBeDisabled();
    });
  });

  describe('popover state management', () => {
    it('clears search value when popover closes', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      // Open popover
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toBeInTheDocument();
      });

      // Type in search
      const input = screen.getByTestId('command-input');
      await user.type(input, 'test');

      // Close popover by clicking trigger again
      await user.click(screen.getByTestId('popover-close-trigger'));

      // Re-open popover - search should be cleared
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toHaveValue('');
      });
    });
  });

  describe('fetch error handling', () => {
    it('handles non-ok response from fetch', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('handles network error during fetch', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    it('handles non-Error exception during fetch', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce('String error');

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe('search with parameter', () => {
    it('fetches with search parameter when searching', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toBeInTheDocument();
      });

      // Type in search
      const input = screen.getByTestId('command-input');
      await user.type(input, 'test');

      // Advance timers to trigger debounced search
      await vi.advanceTimersByTimeAsync(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=test'));
      });

      vi.useRealTimers();
    });

    it('does not skip initial fetch when artists are empty', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <ArtistMultiSelect
              control={control}
              name="artistIds"
              label="Artists"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/artists'));
      });
    });
  });
});
