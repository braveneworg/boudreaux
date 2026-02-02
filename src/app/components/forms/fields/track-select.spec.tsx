import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';

import TrackSelect from './track-select';

import type { TrackOption } from './track-select';

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
  trackId: string;
}

// Test component that uses TrackSelect
const TestTrackSelect = ({
  onTrackChange,
  disabled = false,
  showCreateLink = true,
}: {
  onTrackChange?: (track: TrackOption | null) => void;
  disabled?: boolean;
  showCreateLink?: boolean;
}) => {
  const methods = useForm<TestFormValues>({
    defaultValues: { trackId: '' },
  });

  return (
    <FormProvider {...methods}>
      <TrackSelect
        control={methods.control}
        disabled={disabled}
        label="Track"
        name="trackId"
        onTrackChange={onTrackChange}
        setValue={methods.setValue}
        showCreateLink={showCreateLink}
      />
    </FormProvider>
  );
};

describe('TrackSelect', () => {
  const mockTracks: TrackOption[] = [
    { id: '1', title: 'Track One', duration: 180 },
    { id: '2', title: 'Track Two', duration: 240 },
    { id: '3', title: 'Track Three' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tracks: mockTracks }),
    });
  });

  describe('rendering', () => {
    it('renders with label', () => {
      render(<TestTrackSelect />);
      expect(screen.getByText('Track')).toBeInTheDocument();
    });

    it('renders placeholder text', () => {
      render(<TestTrackSelect />);
      expect(screen.getByRole('combobox')).toHaveTextContent('Select a track...');
    });

    it('renders chevrons icon', () => {
      render(<TestTrackSelect />);
      expect(screen.getByTestId('chevrons-icon')).toBeInTheDocument();
    });

    it('renders disabled when disabled prop is true', () => {
      render(<TestTrackSelect disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('popover interaction', () => {
    it('opens popover when clicked', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search tracks...')).toBeInTheDocument();
      });
    });

    it('fetches tracks when popover opens', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/tracks'));
      });
    });

    it('displays tracks after fetch', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Track One/)).toBeInTheDocument();
        expect(screen.getByText(/Track Two/)).toBeInTheDocument();
      });
    });

    it('displays duration in MM:SS format', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        // 180 seconds = 3:00
        expect(screen.getByText(/Track One \(3:00\)/)).toBeInTheDocument();
        // 240 seconds = 4:00
        expect(screen.getByText(/Track Two \(4:00\)/)).toBeInTheDocument();
      });
    });

    it('displays track without duration when not available', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        // Track Three has no duration
        expect(screen.getByText('Track Three')).toBeInTheDocument();
      });
    });
  });

  describe('selection', () => {
    it('selects a track when clicked', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();
      render(<TestTrackSelect onTrackChange={onTrackChange} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Track One/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Track One/));

      await waitFor(() => {
        expect(onTrackChange).toHaveBeenCalledWith(
          expect.objectContaining({ id: '1', title: 'Track One' })
        );
      });
    });

    it('shows selected track in button', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Track One/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Track One/));

      await waitFor(() => {
        const combobox = screen.getByRole('combobox');
        expect(combobox).toHaveTextContent('Track One');
      });
    });

    it('clears selection when clicking clear button', async () => {
      const user = userEvent.setup();
      const onTrackChange = vi.fn();
      render(<TestTrackSelect onTrackChange={onTrackChange} />);

      await user.click(screen.getByRole('combobox'));
      await waitFor(() => {
        expect(screen.getByText(/Track One/)).toBeInTheDocument();
      });
      await user.click(screen.getByText(/Track One/));

      await waitFor(() => {
        expect(screen.getByTestId('x-icon')).toBeInTheDocument();
      });

      const clearButton = screen.getByTestId('x-icon').closest('button');
      if (clearButton) {
        await user.click(clearButton);
      }

      await waitFor(() => {
        expect(onTrackChange).toHaveBeenLastCalledWith(null);
      });
    });
  });

  describe('search', () => {
    it('filters tracks based on search input', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search tracks...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search tracks...');
      await user.type(searchInput, 'One');

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('search=One'));
      });
    });
  });

  describe('create link', () => {
    it('shows create link by default', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        const createLink = screen.getByTestId('next-link');
        expect(createLink).toHaveAttribute('href', '/admin/tracks/new');
      });
    });

    it('hides create link when showCreateLink is false', async () => {
      const user = userEvent.setup();
      render(<TestTrackSelect showCreateLink={false} />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.queryByTestId('next-link')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('displays error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch tracks'));

      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch tracks/i)).toBeInTheDocument();
      });
    });

    it('shows empty message when no tracks match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tracks: [] }),
      });

      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText('No tracks found.')).toBeInTheDocument();
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
                  json: () => Promise.resolve({ tracks: mockTracks }),
                }),
              100
            )
          )
      );

      const user = userEvent.setup();
      render(<TestTrackSelect />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByText('Loading tracks...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/Track One/)).toBeInTheDocument();
      });
    });
  });
});
