import React from 'react';

import { render, screen, waitFor, act } from '@testing-library/react';

import type { TrackOption } from '@/app/components/forms/fields/track-select';

import FeaturedArtistForm from './featured-artist-form';

import type * as ReactHookForm from 'react-hook-form';

// Capture the onTrackChange prop passed to TrackSelect
let capturedOnTrackChange: ((track: TrackOption | null) => void) | undefined;
// Spy on setValue
const mockSetValue = vi.fn();

vi.mock('react-hook-form', async () => {
  const actual = (await vi.importActual('react-hook-form')) as typeof ReactHookForm;
  const { useForm: actualUseForm, ...rest } = actual;

  return {
    ...rest,
    useForm: <TFieldValues extends ReactHookForm.FieldValues = ReactHookForm.FieldValues>(
      options?: ReactHookForm.UseFormProps<TFieldValues>
    ) => {
      const form = actualUseForm(options);
      const originalSetValue = form.setValue;

      // Wrap setValue with our spy
      form.setValue = (...args: Parameters<typeof originalSetValue>) => {
        mockSetValue(...args);
        return originalSetValue(...args);
      };

      return form;
    },
  };
});

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
    mockSetValue.mockClear();
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

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('releaseId', 'release-abc123def456abc123def456', {
          shouldDirty: true,
          shouldValidate: true,
        });
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

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('releaseId', 'release-first00000000000000', {
          shouldDirty: true,
          shouldValidate: true,
        });
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

      // Clear spy to isolate deselection assertion from selection call
      mockSetValue.mockClear();

      // Then deselect
      await act(() => {
        capturedOnTrackChange?.(null);
      });

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('releaseId', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      });
    });

    it('clears releaseId when track has no releaseTracks', async () => {
      render(<FeaturedArtistForm />);

      const trackWithoutReleases: TrackOption = {
        id: 'track-3',
        title: 'Standalone Track',
        releaseTracks: [],
      };

      await act(() => {
        capturedOnTrackChange?.(trackWithoutReleases);
      });

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('releaseId', '', {
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

      await act(() => {
        capturedOnTrackChange?.(trackWithUndefinedReleases);
      });

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('releaseId', '', {
          shouldDirty: true,
          shouldValidate: true,
        });
      });
    });
  });
});
