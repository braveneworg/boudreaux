import React from 'react';

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TrackOption } from '@/app/components/forms/fields/track-select';

import FeaturedArtistForm from './featured-artist-form';

// Capture props passed to mocked child components
let capturedOnTrackChange: ((track: TrackOption | null) => void) | undefined;
let capturedTrackSelectReleaseId: string | undefined;

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/actions/create-featured-artist-action', () => ({
  createFeaturedArtistAction: vi.fn(),
}));

vi.mock('@/lib/utils/console-logger', () => ({
  error: vi.fn(),
}));

// Mock react useActionState to provide a stable formState
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useActionState: () => [{ fields: {}, success: false }, vi.fn(), false],
  };
});

// Mock form field subcomponents as simple stubs, capturing props we care about
vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({ name, label }: { name: string; label: string }) => (
    <div data-testid={`text-field-${name}`}>{label}</div>
  ),
}));

vi.mock('@/app/components/forms/fields/artist-multi-select', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`artist-multi-select-${name}`}>ArtistMultiSelect</div>
  ),
}));

vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`cover-art-field-${name}`}>CoverArtField</div>
  ),
}));

vi.mock('@/app/components/forms/fields/group-select', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`group-select-${name}`}>GroupSelect</div>
  ),
}));

vi.mock('@/app/components/forms/fields/release-select', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`release-select-${name}`}>ReleaseSelect</div>
  ),
}));

vi.mock('@/app/components/forms/fields/track-select', () => ({
  default: ({
    name,
    onTrackChange,
    releaseId,
  }: {
    name: string;
    onTrackChange?: (track: TrackOption | null) => void;
    releaseId?: string;
  }) => {
    capturedOnTrackChange = onTrackChange;
    capturedTrackSelectReleaseId = releaseId;
    return (
      <div data-testid={`track-select-${name}`} data-release-id={releaseId ?? ''}>
        TrackSelect
      </div>
    );
  },
}));

vi.mock('../ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <div data-testid="breadcrumb-menu">BreadcrumbMenu</div>,
}));

vi.mock('../ui/datepicker', () => ({
  DatePicker: () => <div data-testid="date-picker">DatePicker</div>,
}));

describe('FeaturedArtistForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnTrackChange = undefined;
    capturedTrackSelectReleaseId = undefined;
  });

  describe('rendering', () => {
    it('renders the create form title and submit button', () => {
      render(<FeaturedArtistForm />);

      const titles = screen.getAllByText('Create Featured Artist');
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all media association fields', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('track-select-trackId')).toBeInTheDocument();
      expect(screen.getByTestId('release-select-releaseId')).toBeInTheDocument();
      expect(screen.getByTestId('group-select-groupId')).toBeInTheDocument();
    });

    it('renders artist multi-select and cover art field', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('artist-multi-select-artistIds')).toBeInTheDocument();
      expect(screen.getByTestId('cover-art-field-coverArt')).toBeInTheDocument();
    });

    it('renders breadcrumb, date picker, and display name field', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
      expect(screen.getByTestId('date-picker')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-displayName')).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create featured artist/i })).toBeInTheDocument();
    });

    it('passes onTrackChange callback to TrackSelect', () => {
      render(<FeaturedArtistForm />);

      expect(capturedOnTrackChange).toBeDefined();
      expect(typeof capturedOnTrackChange).toBe('function');
    });
  });

  describe('auto-populate release from track selection', () => {
    it('populates releaseId from the first release when a track with one release is selected', async () => {
      render(<FeaturedArtistForm />);

      const trackWithRelease: TrackOption = {
        id: 'track-1',
        title: 'My Track',
        duration: 200,
        releaseTracks: [{ release: { id: 'abc123def456abc123def456', title: 'My Album' } }],
      };

      await act(() => {
        capturedOnTrackChange?.(trackWithRelease);
      });

      // After handleTrackChange calls setValue('releaseId', ...),
      // useWatch triggers re-render and the value flows to TrackSelect's releaseId prop
      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        expect(trackSelect.getAttribute('data-release-id')).toBe('abc123def456abc123def456');
      });
    });

    it('uses the first release when track has multiple releases', async () => {
      render(<FeaturedArtistForm />);

      const trackWithMultipleReleases: TrackOption = {
        id: 'track-2',
        title: 'Multi-Release Track',
        releaseTracks: [
          { release: { id: 'first00000000000000000000', title: 'First Album' } },
          { release: { id: 'second000000000000000000', title: 'Second Album' } },
        ],
      };

      await act(() => {
        capturedOnTrackChange?.(trackWithMultipleReleases);
      });

      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        expect(trackSelect.getAttribute('data-release-id')).toBe('first00000000000000000000');
      });
    });

    it('clears releaseId when track is deselected (null)', async () => {
      render(<FeaturedArtistForm />);

      // First select a track to populate releaseId
      await act(() => {
        capturedOnTrackChange?.({
          id: 'track-1',
          title: 'Track',
          releaseTracks: [{ release: { id: 'abc123def456abc123def456', title: 'Album' } }],
        });
      });

      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        expect(trackSelect.getAttribute('data-release-id')).toBe('abc123def456abc123def456');
      });

      // Then deselect
      await act(() => {
        capturedOnTrackChange?.(null);
      });

      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        // empty string releaseId becomes undefined via || undefined, rendered as ''
        expect(trackSelect.getAttribute('data-release-id')).toBe('');
      });
    });

    it('sets empty releaseId when track has no releaseTracks', async () => {
      render(<FeaturedArtistForm />);

      await act(() => {
        capturedOnTrackChange?.({
          id: 'track-3',
          title: 'Standalone Track',
          releaseTracks: [],
        });
      });

      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        expect(trackSelect.getAttribute('data-release-id')).toBe('');
      });
    });

    it('sets empty releaseId when track has undefined releaseTracks', async () => {
      render(<FeaturedArtistForm />);

      await act(() => {
        capturedOnTrackChange?.({
          id: 'track-4',
          title: 'Legacy Track',
        });
      });

      await waitFor(() => {
        const trackSelect = screen.getByTestId('track-select-trackId');
        expect(trackSelect.getAttribute('data-release-id')).toBe('');
      });
    });
  });

  describe('releaseId pass-through to TrackSelect', () => {
    it('passes empty releaseId to TrackSelect initially (no release selected)', () => {
      render(<FeaturedArtistForm />);

      // watchedReleaseId starts as '' which becomes undefined via || undefined
      expect(capturedTrackSelectReleaseId).toBeUndefined();
    });
  });

  describe('cancel navigation', () => {
    it('navigates to admin featured artist list when cancel is clicked', async () => {
      render(<FeaturedArtistForm />);

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockPush).toHaveBeenCalledWith('/admin?entity=featuredArtist');
    });
  });

  describe('edit mode', () => {
    it('shows loading state when featuredArtistId is provided', () => {
      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.getByText('Loading featured artist...')).toBeInTheDocument();
    });

    it('does not render form fields while loading', () => {
      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.queryByTestId('track-select-trackId')).not.toBeInTheDocument();
      expect(screen.queryByTestId('release-select-releaseId')).not.toBeInTheDocument();
    });
  });
});
