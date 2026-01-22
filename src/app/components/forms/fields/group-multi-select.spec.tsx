import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import GroupMultiSelect from './group-multi-select';

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
    <a data-testid="create-group-link" href={href} className={className}>
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
  groupIds: string[];
}

const mockGroups = [
  {
    id: 'group-1',
    name: 'Group One',
    displayName: 'Group One Display',
    artistGroups: [
      {
        artist: { id: 'artist-1', displayName: 'Artist One', firstName: 'One', surname: 'Artist' },
      },
      {
        artist: { id: 'artist-2', displayName: 'Artist Two', firstName: 'Two', surname: 'Artist' },
      },
    ],
  },
  {
    id: 'group-2',
    name: 'Group Two',
    displayName: 'Group Two Display',
    artistGroups: [
      { artist: { id: 'artist-3', displayName: '', firstName: 'Three', surname: 'Artist' } },
    ],
  },
  {
    id: 'group-3',
    name: 'Empty Group',
    displayName: '',
    artistGroups: [],
  },
];

const TestWrapper = ({
  children,
  defaultValues = { groupIds: [] },
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

describe('GroupMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPopoverOpen = false;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: mockGroups }),
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
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('form-label')).toHaveTextContent('Groups');
    });

    it('renders with custom placeholder', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              placeholder="Choose groups..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Choose groups...');
    });

    it('renders disabled when disabled prop is true', () => {
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
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
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
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

    it('fetches groups when popover opens', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/groups'));
      });
    });
  });

  describe('search functionality', () => {
    it('renders search input with placeholder', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              searchPlaceholder="Find groups..."
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-input')).toHaveAttribute(
          'placeholder',
          'Find groups...'
        );
      });
    });
  });

  describe('group display', () => {
    it('displays group items when loaded', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toBeInTheDocument();
        expect(screen.getByTestId('command-item-group-2')).toBeInTheDocument();
      });
    });

    it('shows display name when available', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toHaveTextContent('Group One Display');
      });
    });

    it('shows name when displayName is empty', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-3')).toHaveTextContent('Empty Group');
      });
    });

    it('shows artists in group items', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toHaveTextContent('Artist One');
        expect(screen.getByTestId('command-item-group-1')).toHaveTextContent('Artist Two');
      });
    });

    it('shows firstName surname for artist when displayName is empty', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-2')).toHaveTextContent('Three Artist');
      });
    });
  });

  describe('selection behavior', () => {
    it('shows selected count when groups are selected', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-group-1'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('1 group selected');
    });

    it('shows plural count for multiple selected groups', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-group-1'));
      await user.click(screen.getByTestId('command-item-group-2'));

      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('2 groups selected');
    });
  });

  describe('create group link', () => {
    it('includes returnTo parameter when releaseId is provided', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              releaseId="release-123"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-group-link');
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
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              releaseId="release-123"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-group-link');
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
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        const links = screen.getAllByTestId('create-group-link');
        const bottomLink = links[links.length - 1];
        expect(bottomLink).toHaveAttribute('href', '/admin/groups/new');
      });
    });
  });

  describe('toggle selection', () => {
    it('deselects group when clicking on already selected item', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toBeInTheDocument();
      });

      // Select
      await user.click(screen.getByTestId('command-item-group-1'));
      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('1 group selected');

      // Deselect
      await user.click(screen.getByTestId('command-item-group-1'));
      expect(screen.getByTestId('combobox-trigger')).toHaveTextContent('Select groups...');
    });
  });

  describe('onGroupsChange callback', () => {
    it('calls onGroupsChange with selected groups when selection changes', async () => {
      const user = userEvent.setup();
      const onGroupsChange = vi.fn();
      render(
        <TestWrapper>
          {({ control, setValue }) => (
            <GroupMultiSelect
              control={control}
              name="groupIds"
              label="Groups"
              setValue={setValue}
              onGroupsChange={onGroupsChange}
            />
          )}
        </TestWrapper>
      );

      await user.click(screen.getByTestId('popover-trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('command-item-group-1')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('command-item-group-1'));

      expect(onGroupsChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'group-1' })])
      );
    });
  });
});
