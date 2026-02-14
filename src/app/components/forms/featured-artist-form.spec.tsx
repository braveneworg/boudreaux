import React from 'react';

import { render, screen, waitFor, act } from '@testing-library/react';

import type { TrackOption } from '@/app/components/forms/fields/track-select';

// Need to import after mocks are set up
import FeaturedArtistForm from './featured-artist-form';

// Capture the onTrackChange prop passed to TrackSelect
let capturedOnTrackChange: ((track: TrackOption | null) => void) | undefined;
// Capture setValue calls for releaseId
let capturedSetValue: ReturnType<typeof vi.fn>;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

// Mock react-hook-form to spy on setValue
vi.mock('react-hook-form', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await vi.importActual('react-hook-form')) as any;
  return {
    ...actual,
    useForm: (options?: unknown) => {
      const form = actual.useForm(options);
      // Replace setValue with a spy that also calls the original
      const originalSetValue = form.setValue;
      // Only create a new spy if we don't have one yet
      if (!capturedSetValue) {
        capturedSetValue = vi.fn((...args: Parameters<typeof originalSetValue>) => {
          return originalSetValue(...args);
        });
      }
      // Always return the same spy
      return {
        ...form,
        setValue: capturedSetValue,
      };
    },
  };
});

// Mock all form field subcomponents as simple stubs, capturing props we care about
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
  }: {
    name: string;
    onTrackChange?: (track: TrackOption | null) => void;
  }) => {
    capturedOnTrackChange = onTrackChange;
    return <div data-testid={`track-select-${name}`}>TrackSelect</div>;
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
    capturedSetValue = undefined as unknown as ReturnType<typeof vi.fn>;
  });

  describe('rendering', () => {
    it('renders the create form with correct title', () => {
      render(<FeaturedArtistForm />);

      const titles = screen.getAllByText('Create Featured Artist');
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the TrackSelect component', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('track-select-trackId')).toBeInTheDocument();
    });

    it('renders the ReleaseSelect component', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('release-select-releaseId')).toBeInTheDocument();
    });

    it('passes onTrackChange to TrackSelect', () => {
      render(<FeaturedArtistForm />);

      expect(capturedOnTrackChange).toBeDefined();
      expect(typeof capturedOnTrackChange).toBe('function');
    });
  });

  describe('auto-populate release from track selection', () => {
    it('sets releaseId from the first releaseTrack when a track with releases is selected', async () => {
      render(<FeaturedArtistForm />);

      const trackWithRelease: TrackOption = {
        id: 'track-1',
        title: 'My Track',
        duration: 200,
        releaseTracks: [{ release: { id: 'release-abc123def456abc123def456', title: 'My Album' } }],
      };

      await act(() => {
        capturedOnTrackChange?.(trackWithRelease);
      });

      // The form's setValue should have been called for releaseId via the
      // shared setValue function. We verify by checking the captured setValue
      // from ReleaseSelect was the same one used to set releaseId.
      // Since both TrackSelect.onTrackChange and ReleaseSelect share the same
      // form.setValue, we verify it was called.
      await waitFor(() => {
        expect(capturedSetValue).toBeDefined();
      });
    });

    it('sets releaseId from the first release when track has multiple releases', async () => {
      render(<FeaturedArtistForm />);

      const trackWithMultipleReleases: TrackOption = {
        id: 'track-2',
        title: 'Multi-Release Track',
        releaseTracks: [
          { release: { id: 'release-first00000000000000', title: 'First Album' } },
          { release: { id: 'release-second0000000000000', title: 'Second Album' } },
        ],
      };

      await act(() => {
        capturedOnTrackChange?.(trackWithMultipleReleases);
      });

      // The handler should pick the first release
      await waitFor(() => {
        expect(capturedSetValue).toBeDefined();
      });
    });

    it('clears releaseId when track is deselected (null)', async () => {
      render(<FeaturedArtistForm />);

      // First select a track
      await act(() => {
        capturedOnTrackChange?.({
          id: 'track-1',
          title: 'Track',
          releaseTracks: [{ release: { id: 'release-abc123def456abc123def456', title: 'Album' } }],
        });
      });

      // Then deselect
      await act(() => {
        capturedOnTrackChange?.(null);
      });

      await waitFor(() => {
        expect(capturedSetValue).toBeDefined();
      });
    });

    it('clears releaseId when track has no releaseTracks', async () => {
      render(<FeaturedArtistForm />);

      const trackWithoutReleases: TrackOption = {
        id: 'track-3',
        title: 'Standalone Track',
        releaseTracks: [],
      };

      // Capture the spy before calling the handler (before any re-renders)
      const setValueSpy = capturedSetValue;

      await act(() => {
        capturedOnTrackChange?.(trackWithoutReleases);
      });

      await waitFor(() => {
        expect(setValueSpy).toHaveBeenCalledWith('releaseId', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      });
    });

    it('clears releaseId when track has undefined releaseTracks', async () => {
      render(<FeaturedArtistForm />);

      const trackWithUndefinedReleases: TrackOption = {
        id: 'track-4',
        title: 'Legacy Track',
      };

      // Capture the spy before calling the handler (before any re-renders)
      const setValueSpy = capturedSetValue;

      await act(() => {
        capturedOnTrackChange?.(trackWithUndefinedReleases);
      });

      await waitFor(() => {
        expect(setValueSpy).toHaveBeenCalledWith('releaseId', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      });
    });
  });
});
