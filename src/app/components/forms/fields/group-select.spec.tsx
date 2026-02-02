import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import GroupSelect from './group-select';

import type { GroupOption } from './group-select';

// Add scrollIntoView mock for cmdk
Element.prototype.scrollIntoView = vi.fn();

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a data-testid="next-link" href={href}>
      {children}
    </a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon">✓</span>,
  ChevronsUpDown: () => <span data-testid="chevrons-icon">⬍</span>,
  Plus: () => <span data-testid="plus-icon">+</span>,
  X: () => <span data-testid="x-icon">×</span>,
  SearchIcon: () => <span data-testid="search-icon">🔍</span>,
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface TestFormValues {
  groupId: string;
}

// Test component that uses GroupSelect
const TestGroupSelect = ({
  onGroupChange,
  disabled = false,
  showCreateLink = true,
}: {
  onGroupChange?: (group: GroupOption | null) => void;
  disabled?: boolean;
  showCreateLink?: boolean;
}) => {
  const methods = useForm<TestFormValues>({
    defaultValues: { groupId: '' },
  });

  return (
    <FormProvider {...methods}>
      <GroupSelect
        control={methods.control}
        disabled={disabled}
        label="Group"
        name="groupId"
        onGroupChange={onGroupChange}
        setValue={methods.setValue}
        showCreateLink={showCreateLink}
      />
    </FormProvider>
  );
};

describe('GroupSelect', () => {
  const mockGroups: GroupOption[] = [
    { id: '1', name: 'band-one', displayName: 'Band One' },
    { id: '2', name: 'band-two', displayName: 'Band Two' },
    { id: '3', name: 'solo-artist' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: mockGroups }),
    });
  });

  describe('rendering', () => {
    it('renders with label', () => {
      render(<TestGroupSelect />);
      expect(screen.getByText('Group')).toBeInTheDocument();
    });

    it('renders placeholder text', () => {
      render(<TestGroupSelect />);
      expect(screen.getByRole('combobox')).toHaveTextContent('Select a group...');
    });

    it('renders chevrons icon', () => {
      render(<TestGroupSelect />);
      expect(screen.getByTestId('chevrons-icon')).toBeInTheDocument();
    });

    it('renders disabled when disabled prop is true', () => {
      render(<TestGroupSelect disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('popover interaction', () => {
    it('opens popover when clicked', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search groups...')).toBeInTheDocument();
      });
    });

    it('fetches groups when popover opens', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/groups'));
      });
    });

    it('displays groups after fetch', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Band One')).toBeInTheDocument();
        expect(screen.getByText('Band Two')).toBeInTheDocument();
      });
    });

    it('uses name as fallback when displayName is not available', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('solo-artist')).toBeInTheDocument();
      });
    });
  });

  describe('selection', () => {
    it('selects a group when clicked', async () => {
      const user = userEvent.setup();
      const onGroupChange = vi.fn();
      render(<TestGroupSelect onGroupChange={onGroupChange} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Band One')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Band One'));

      await waitFor(() => {
        expect(onGroupChange).toHaveBeenCalledWith(
          expect.objectContaining({ id: '1', name: 'band-one' })
        );
      });
    });

    it('shows selected group in button', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Band One')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Band One'));

      await waitFor(() => {
        const combobox = screen.getByRole('combobox');
        expect(combobox).toHaveTextContent('Band One');
      });
    });

    it('clears selection when clicking clear button', async () => {
      const user = userEvent.setup();
      const onGroupChange = vi.fn();
      render(<TestGroupSelect onGroupChange={onGroupChange} />);

      // Open popover and select a group
      await user.click(screen.getByRole('combobox'));
      await waitFor(() => {
        expect(screen.getByText('Band One')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Band One'));

      // Now find and click the clear button
      await waitFor(() => {
        expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      });

      const clearButton = screen.getByTestId('x-icon').closest('button');
      if (clearButton) {
        await user.click(clearButton);
      }

      await waitFor(() => {
        expect(onGroupChange).toHaveBeenLastCalledWith(null);
      });
    });
  });

  describe('search', () => {
    it('filters groups based on search input', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search groups...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search groups...');
      await user.type(searchInput, 'Band');

      // Search triggers fetch with search parameter
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=Band'));
      });
    });
  });

  describe('create link', () => {
    it('shows create link by default', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const createLink = screen.getByTestId('next-link');
        expect(createLink).toHaveAttribute('href', '/admin/groups/new');
      });
    });

    it('hides create link when showCreateLink is false', async () => {
      const user = userEvent.setup();
      render(<TestGroupSelect showCreateLink={false} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.queryByTestId('next-link')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch groups'));

      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch groups/i)).toBeInTheDocument();
      });
    });

    it('shows empty message when no groups match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [] }),
      });

      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('No groups found.')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows loading state while fetching', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ groups: mockGroups }),
                }),
              100
            )
          )
      );

      const user = userEvent.setup();
      render(<TestGroupSelect />);

      await user.click(screen.getByRole('combobox'));

      // Should show loading indicator
      expect(screen.getByText('Loading groups...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Band One')).toBeInTheDocument();
      });
    });
  });
});
