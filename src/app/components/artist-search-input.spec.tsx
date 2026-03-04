/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ArtistSearchInput } from './artist-search-input';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="search-result-image" data-src={src} data-alt={alt} />
  ),
}));

// Mock the useDebounce hook to return value immediately for testing
vi.mock('@/app/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

// Mock the UI components
vi.mock('@/app/components/ui/command', () => ({
  Command: ({ children }: { children: ReactNode; shouldFilter?: boolean }) => (
    <div data-testid="command">{children}</div>
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandGroup: ({ children, heading }: { children: ReactNode; heading?: string }) => (
    <div data-testid="command-group" data-heading={heading}>
      {children}
    </div>
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    value?: string;
    className?: string;
  }) => (
    <div
      data-testid={`command-item-${value}`}
      onClick={onSelect}
      role="option"
      aria-selected={false}
    >
      {children}
    </div>
  ),
  CommandList: ({ children }: { children: ReactNode; id?: string }) => (
    <div data-testid="command-list">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="popover" data-open={open?.toString()}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({
    children,
  }: {
    children: ReactNode;
    className?: string;
    align?: string;
    onOpenAutoFocus?: (e: Event) => void;
  }) => <div data-testid="popover-content">{children}</div>,
}));

describe('ArtistSearchInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the search input', () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Search artists & releases...');
  });

  it('should have correct accessibility attributes', () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-label', 'Search artists and releases');
    expect(input).toHaveAttribute('type', 'search');
  });

  it('should update query on input change', () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });

    expect(input).toHaveValue('test');
  });

  it('should not fetch when query is shorter than 3 characters', async () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'ab' } });

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('should fetch results when query is 3+ characters', async () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/artists/search?q=test',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('should display search results', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: 'https://example.com/thumb.jpg',
        releases: [{ id: 'release-1', title: 'Album One' }],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
      expect(screen.getByText('Album One')).toBeInTheDocument();
    });
  });

  it('should display artist thumbnail when available', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: 'https://example.com/thumb.jpg',
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByTestId('search-result-image')).toHaveAttribute(
        'data-src',
        'https://example.com/thumb.jpg'
      );
    });
  });

  it('should display fallback avatar when no thumbnail', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.queryByTestId('search-result-image')).not.toBeInTheDocument();
    });
  });

  it('should navigate to artist page when artist is selected', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('command-item-artist-john-doe'));

    expect(mockPush).toHaveBeenCalledWith('/artists/john-doe');
  });

  it('should navigate to artist page with release param when release is selected', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [{ id: 'release-1', title: 'Album One' }],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('Album One')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('command-item-release-release-1'));

    expect(mockPush).toHaveBeenCalledWith('/artists/john-doe?release=release-1');
  });

  it('should clear query after selecting an artist', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('command-item-artist-john-doe'));

    expect(input).toHaveValue('');
  });

  it('should show empty state when no results are found', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: [] }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText('No artists or releases found.')).toBeInTheDocument();
    });
  });

  it('should show loading state while fetching', async () => {
    let resolvePromise: (value: { results: never[] }) => void;
    const pendingPromise = new Promise<{ results: never[] }>((resolve) => {
      resolvePromise = resolve;
    });

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => pendingPromise,
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    // Resolve to avoid dangling promise
    resolvePromise!({ results: [] });
  });

  it('should handle fetch errors gracefully', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });

    // Should not crash - wait for fetch to settle
    await waitFor(() => {
      expect(input).toHaveValue('test');
    });
  });

  it('should abort previous request when query changes', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.change(input, { target: { value: 'testing' } });

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    abortSpy.mockRestore();
  });

  it('should encode the query parameter in the fetch URL', async () => {
    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test & foo' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/artists/search?q=test%20%26%20foo',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('should clear results when query becomes shorter than 3 characters', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');

    // Type enough to get results
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
    });

    // Clear back to short query
    fireEvent.change(input, { target: { value: 'jo' } });

    await waitFor(() => {
      expect(screen.queryByText('All releases by John Doe')).not.toBeInTheDocument();
    });
  });

  it('should handle AbortError silently', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.spyOn(global, 'fetch').mockRejectedValue(abortError);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });

    // Should not crash
    await waitFor(() => {
      expect(input).toHaveValue('test');
    });
  });

  it('should open dropdown on focus when query is long enough and has results', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');

    // Type and get results
    fireEvent.change(input, { target: { value: 'john' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
    });

    // Focus the input
    fireEvent.focus(input);

    // Verify the popover state
    const popover = screen.getByTestId('popover');
    expect(popover).toHaveAttribute('data-open', 'true');
  });

  it('should display multiple results with their releases', async () => {
    const mockResults = [
      {
        artistSlug: 'john-doe',
        artistName: 'John Doe',
        thumbnailSrc: null,
        releases: [
          { id: 'r1', title: 'Album One' },
          { id: 'r2', title: 'Album Two' },
        ],
      },
      {
        artistSlug: 'jane-smith',
        artistName: 'Jane Smith',
        thumbnailSrc: null,
        releases: [{ id: 'r3', title: 'Album Three' }],
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ results: mockResults }),
    } as Response);

    render(<ArtistSearchInput />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'art' } });

    await waitFor(() => {
      expect(screen.getByText('All releases by John Doe')).toBeInTheDocument();
      expect(screen.getByText('All releases by Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Album One')).toBeInTheDocument();
      expect(screen.getByText('Album Two')).toBeInTheDocument();
      expect(screen.getByText('Album Three')).toBeInTheDocument();
    });
  });
});
