import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import ReleaseSelect from './release-select';

import type { ReleaseOption } from './release-select';

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
  releaseId: string;
}

// Test component that uses ReleaseSelect
const TestReleaseSelect = ({
  onReleaseChange,
  disabled = false,
  showCreateLink = true,
}: {
  onReleaseChange?: (release: ReleaseOption | null) => void;
  disabled?: boolean;
  showCreateLink?: boolean;
}) => {
  const methods = useForm<TestFormValues>({
    defaultValues: { releaseId: '' },
  });

  return (
    <FormProvider {...methods}>
      <ReleaseSelect
        control={methods.control}
        disabled={disabled}
        label="Release"
        name="releaseId"
        onReleaseChange={onReleaseChange}
        setValue={methods.setValue}
        showCreateLink={showCreateLink}
      />
    </FormProvider>
  );
};

describe('ReleaseSelect', () => {
  const mockReleases: ReleaseOption[] = [
    { id: '1', title: 'Album One', releasedOn: '2023-05-15' },
    { id: '2', title: 'Album Two', releasedOn: '2022-08-20' },
    { id: '3', title: 'Album Three' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ releases: mockReleases }),
    });
  });

  describe('rendering', () => {
    it('renders with label', () => {
      render(<TestReleaseSelect />);
      expect(screen.getByText('Release')).toBeInTheDocument();
    });

    it('renders placeholder text', () => {
      render(<TestReleaseSelect />);
      expect(screen.getByRole('combobox')).toHaveTextContent('Select a release...');
    });

    it('renders chevrons icon', () => {
      render(<TestReleaseSelect />);
      expect(screen.getByTestId('chevrons-icon')).toBeInTheDocument();
    });

    it('renders disabled when disabled prop is true', () => {
      render(<TestReleaseSelect disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('popover interaction', () => {
    it('opens popover when clicked', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search releases...')).toBeInTheDocument();
      });
    });

    it('fetches releases when popover opens', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/releases'));
      });
    });

    it('displays releases after fetch', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Album One/)).toBeInTheDocument();
        expect(screen.getByText(/Album Two/)).toBeInTheDocument();
      });
    });

    it('displays year when releasedOn is available', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Album One \(2023\)/)).toBeInTheDocument();
        expect(screen.getByText(/Album Two \(2022\)/)).toBeInTheDocument();
      });
    });

    it('displays release without year when releasedOn is not available', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('Album Three')).toBeInTheDocument();
      });
    });
  });

  describe('selection', () => {
    it('selects a release when clicked', async () => {
      const user = userEvent.setup();
      const onReleaseChange = vi.fn();
      render(<TestReleaseSelect onReleaseChange={onReleaseChange} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Album One/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Album One/));

      await waitFor(() => {
        expect(onReleaseChange).toHaveBeenCalledWith(
          expect.objectContaining({ id: '1', title: 'Album One' })
        );
      });
    });

    it('shows selected release in button', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Album One/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Album One/));

      await waitFor(() => {
        const combobox = screen.getByRole('combobox');
        expect(combobox).toHaveTextContent('Album One');
      });
    });

    it('clears selection when clicking clear button', async () => {
      const user = userEvent.setup();
      const onReleaseChange = vi.fn();
      render(<TestReleaseSelect onReleaseChange={onReleaseChange} />);

      await user.click(screen.getByRole('combobox'));
      await waitFor(() => {
        expect(screen.getByText(/Album One/)).toBeInTheDocument();
      });
      await user.click(screen.getByText(/Album One/));

      await waitFor(() => {
        expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      });

      const clearButton = screen.getByTestId('x-icon').closest('button');
      if (clearButton) {
        await user.click(clearButton);
      }

      await waitFor(() => {
        expect(onReleaseChange).toHaveBeenLastCalledWith(null);
      });
    });
  });

  describe('search', () => {
    it('filters releases based on search input', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search releases...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search releases...');
      await user.type(searchInput, 'Album');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=Album'));
      });
    });
  });

  describe('create link', () => {
    it('shows create link by default', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const createLink = screen.getByTestId('next-link');
        expect(createLink).toHaveAttribute('href', '/admin/releases/new');
      });
    });

    it('hides create link when showCreateLink is false', async () => {
      const user = userEvent.setup();
      render(<TestReleaseSelect showCreateLink={false} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.queryByTestId('next-link')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch releases'));

      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch releases/i)).toBeInTheDocument();
      });
    });

    it('shows empty message when no releases match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ releases: [] }),
      });

      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('No releases found.')).toBeInTheDocument();
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
                  json: () => Promise.resolve({ releases: mockReleases }),
                }),
              100
            )
          )
      );

      const user = userEvent.setup();
      render(<TestReleaseSelect />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByText('Loading releases...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/Album One/)).toBeInTheDocument();
      });
    });
  });
});
