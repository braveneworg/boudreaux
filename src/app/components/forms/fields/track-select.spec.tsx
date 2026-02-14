import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import TrackSelect from './track-select';

import type { TrackOption } from './track-select';
import type { Control, UseFormSetValue } from 'react-hook-form';

// Mock the UI components
vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (context: {
      field: { value: string; onChange: (value: string) => void };
    }) => React.ReactNode;
  }) => {
    const [value, setValue] = React.useState<string>('');
    const field = {
      value,
      onChange: (newValue: string) => setValue(newValue),
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
      data-testid={role === 'combobox' ? 'combobox-trigger' : undefined}
      role={role}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
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
    <a data-testid="create-track-link" href={href} className={className}>
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
  trackId: string;
}

const mockTracks: TrackOption[] = [
  {
    id: 'track-1',
    title: 'Track One',
    duration: 180,
    releaseTracks: [{ release: { id: 'release-1', title: 'Album One' } }],
  },
  {
    id: 'track-2',
    title: 'Track Two',
    duration: 240,
    releaseTracks: [
      { release: { id: 'release-2', title: 'Album Two' } },
      { release: { id: 'release-3', title: 'Album Three' } },
    ],
  },
  {
    id: 'track-3',
    title: 'Track Three',
    releaseTracks: [],
  },
];

const TestWrapper = ({
  children,
  defaultValues = { trackId: '' },
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

describe('TrackSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPopoverOpen = false;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tracks: mockTracks }),
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
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('form-label')).toHaveTextContent('Track');
    });

    it('renders with custom placeholder', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              placeholder="Choose a track..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Choose a track...');
    });

    it('renders disabled when disabled prop is true', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
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
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('popover-content')).toBeInTheDocument();
      });
    });

    it('fetches tracks when popover opens', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks'));
      });
    });
  });

  describe('track display', () => {
    it('displays track items when loaded', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
        expect(screen.getByTestId('command-item-track-2')).toBeInTheDocument();
        expect(screen.getByTestId('command-item-track-3')).toBeInTheDocument();
      });
    });

    it('shows track title with duration', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toHaveTextContent('Track One (3:00)');
      });
    });

    it('shows track title without duration when not provided', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-3')).toHaveTextContent('Track Three');
      });
    });
  });

  describe('selection behavior', () => {
    it('shows selected track name on trigger after selection', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-track-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Track One (3:00)');
    });

    it('deselects track when clicking on already selected item', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              placeholder="Select a track..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      // First select a track
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Track One (3:00)');

      // Re-open and deselect by clicking the same track
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select a track...');
    });

    it('calls onTrackChange when a track is selected', async () => {
      const user = userEvent.setup();
      const mockOnTrackChange = vi.fn();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              placeholder="Select a track..."
              setValue={setValue}
              onTrackChange={mockOnTrackChange}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });

      // Select
      await user.click(screen.getByTestId('command-item-track-1'));
      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Track One (3:00)');

      // Re-open and deselect
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select a track...');
    });
  });

  describe('onTrackChange callback', () => {
    it('calls onTrackChange with full track data including releaseTracks when a track is selected', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              setValue={setValue}
              onTrackChange={onTrackChange}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-track-1'));

      expect(onTrackChange).toHaveBeenCalledWith({
        id: 'track-1',
        title: 'Track One',
        duration: 180,
        releaseTracks: [{ release: { id: 'release-1', title: 'Album One' } }],
      });
    });

    it('passes track with multiple releaseTracks when selected', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              setValue={setValue}
              onTrackChange={onTrackChange}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-2')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-track-2'));

      expect(onTrackChange).toHaveBeenCalledWith({
        id: 'track-2',
        title: 'Track Two',
        duration: 240,
        releaseTracks: [
          { release: { id: 'release-2', title: 'Album Two' } },
          { release: { id: 'release-3', title: 'Album Three' } },
        ],
      });
    });

    it('passes track with empty releaseTracks when track has no releases', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              setValue={setValue}
              onTrackChange={onTrackChange}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-3')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-track-3'));

      expect(onTrackChange).toHaveBeenCalledWith({
        id: 'track-3',
        title: 'Track Three',
        releaseTracks: [],
      });
    });

    it('calls onTrackChange with null when track is deselected', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              setValue={setValue}
              onTrackChange={onTrackChange}
            />
          )}
        </TestWrapper>
      );

      // Select a track
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));

      // Re-open and deselect the same track
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));

      expect(onTrackChange).toHaveBeenCalledTimes(2);
      expect(onTrackChange).toHaveBeenLastCalledWith(null);
    });

    it('calls onTrackChange with null when clear button is clicked', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              setValue={setValue}
              onTrackChange={onTrackChange}
            />
          )}
        </TestWrapper>
      );

      // Select a track
      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-item-track-1')).toBeInTheDocument();
      });
      await user.click(screen.getByTestId('command-item-track-1'));
      expect(onTrackChange).toHaveBeenCalledTimes(1);

      // Click clear button
      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearButton);

      expect(onTrackChange).toHaveBeenCalledTimes(2);
      expect(onTrackChange).toHaveBeenLastCalledWith(null);
    });
  });

  describe('search functionality', () => {
    it('renders search input with placeholder', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              searchPlaceholder="Find tracks..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toHaveAttribute(
          'placeholder',
          'Find tracks...'
        );
      });
    });

    it('fetches with search parameter when searching', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toBeInTheDocument();
      });

      const input = screen.getByTestId('command-input');
      await user.type(input, 'test');

      await vi.advanceTimersByTimeAsync(350);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=test'));
      });

      vi.useRealTimers();
    });

    it('clears search value when popover closes', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toBeInTheDocument();
      });

      const input = screen.getByTestId('command-input');
      await user.type(input, 'test');

      await user.click(screen.getByTestId('popover-close-trigger'));

      await user.click(screen.getByTestId('popover-trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toHaveValue('');
      });
    });
  });

  describe('fetch error handling', () => {
    it('shows error message on non-ok response', async () => {
      const user = userEvent.setup();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        expect(screen.getByText('Failed to fetch tracks')).toBeInTheDocument();
      });
    });

    it('handles network error during fetch', async () => {
      const user = userEvent.setup();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('create track link', () => {
    it('shows create new track link by default', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect control={control} name="trackId" label="Track" setValue={setValue} />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const link = screen.getByTestId('create-track-link');
        expect(link).toHaveAttribute('href', '/admin/tracks/new');
      });
    });

    it('hides create link when showCreateLink is false', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <TrackSelect
              control={control}
              name="trackId"
              label="Track"
              showCreateLink={false}
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-list')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('create-track-link')).not.toBeInTheDocument();
    });
  });
});
