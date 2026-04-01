/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FeaturedArtistForm from './featured-artist-form';

import type * as ReactHookFormTypes from 'react-hook-form';

// Capture props passed to mocked ReleaseSelect
let capturedReleaseSelectSetValue:
  | ((name: string, value: string, options?: Record<string, boolean>) => void)
  | undefined;

// Spy for react-hook-form setValue
const mockSetValue = vi.fn();

const mockPush = vi.fn();

vi.mock('react-hook-form', async () => {
  const actual = (await vi.importActual('react-hook-form')) as typeof ReactHookFormTypes;

  // Maintain stable setValue wrapper across re-renders to prevent useEffect churn
  const wrapperByForm = new WeakMap<object, ReturnType<typeof actual.useForm>['setValue']>();

  return {
    ...actual,
    useForm: (options?: Parameters<typeof actual.useForm>[0]) => {
      const form = actual.useForm(options);

      if (!wrapperByForm.has(form)) {
        const originalSetValue = form.setValue;
        const wrapped = ((...args: Parameters<typeof originalSetValue>) => {
          mockSetValue(...args);
          return originalSetValue(...args);
        }) as typeof originalSetValue;
        wrapperByForm.set(form, wrapped);
      }

      const cached = wrapperByForm.get(form);
      if (cached) {
        form.setValue = cached;
      }

      return form;
    },
  };
});

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

// Mock form field subcomponents as simple stubs, capturing props we care about
vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({ name, label }: { name: string; label: string }) => (
    <div data-testid={`text-field-${name}`}>{label}</div>
  ),
}));

vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid={`cover-art-field-${name}`}>CoverArtField</div>
  ),
}));

vi.mock('@/app/components/forms/fields/release-select', () => ({
  default: ({
    name,
    setValue,
  }: {
    name: string;
    setValue?: (name: string, value: string, options?: Record<string, boolean>) => void;
  }) => {
    capturedReleaseSelectSetValue = setValue;
    return <div data-testid={`release-select-${name}`}>ReleaseSelect</div>;
  },
}));

vi.mock('../ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <div data-testid="breadcrumb-menu">BreadcrumbMenu</div>,
}));

vi.mock('../ui/datepicker', () => ({
  DatePicker: () => <div data-testid="date-picker">DatePicker</div>,
}));

let _capturedSelectOnValueChange: ((val: string) => void) | undefined;

vi.mock('@/app/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (val: string) => void;
  }) => {
    _capturedSelectOnValueChange = onValueChange;
    return (
      <div data-testid="featured-track-select" data-value={value ?? ''}>
        {children}
      </div>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-trigger">{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
}));

describe('FeaturedArtistForm', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetValue.mockClear();
    mockFetch.mockReset();
    capturedReleaseSelectSetValue = undefined;
    _capturedSelectOnValueChange = undefined;
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('rendering', () => {
    it('renders the create form title and submit button', () => {
      render(<FeaturedArtistForm />);

      const titles = screen.getAllByText('Create Featured Artist');
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    it('renders release media association field', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('release-select-releaseId')).toBeInTheDocument();
    });

    it('renders cover art field', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('cover-art-field-coverArt')).toBeInTheDocument();
    });

    it('renders breadcrumb, date pickers, and display name field', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
      expect(screen.getAllByTestId('date-picker')).toHaveLength(2);
      expect(screen.getByTestId('text-field-displayName')).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      render(<FeaturedArtistForm />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create featured artist/i })).toBeInTheDocument();
    });
  });

  describe('digital format auto-fetch on release selection', () => {
    const TEST_RELEASE_ID = 'abc123def456abc123def456';
    const TEST_FORMAT_ID = 'def456abc123def456abc123';

    it('auto-sets digitalFormatId when release has MP3_320KBPS format', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            digitalFormat: {
              id: TEST_FORMAT_ID,
              files: [
                { id: 'file-1', trackNumber: 1, title: null, fileName: 'track-1.mp3' },
                { id: 'file-2', trackNumber: 2, title: null, fileName: 'track-2.mp3' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/releases/${TEST_RELEASE_ID}/digital-formats?formatType=MP3_320KBPS`
        );
      });

      await waitFor(() => {
        expect(mockSetValue).toHaveBeenCalledWith('digitalFormatId', TEST_FORMAT_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });
    });

    it('shows format found status with file count when MP3 format exists', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            digitalFormat: {
              id: TEST_FORMAT_ID,
              files: [
                { id: 'file-1', trackNumber: 1, title: null, fileName: 'track-1.mp3' },
                { id: 'file-2', trackNumber: 2, title: null, fileName: 'track-2.mp3' },
                { id: 'file-3', trackNumber: 3, title: null, fileName: 'track-3.mp3' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/MP3 320kbps format available/)).toBeInTheDocument();
        expect(screen.getByText(/3 files/)).toBeInTheDocument();
      });
    });

    it('shows missing format status when release has no MP3_320KBPS format', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/No MP3 320kbps format found/)).toBeInTheDocument();
      });
    });

    it('shows loading status while checking format availability', async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      mockFetch.mockReturnValue(fetchPromise);

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Checking for MP3 320kbps format/)).toBeInTheDocument();
      });

      // Clean up pending fetch to avoid act warnings
      await act(async () => {
        resolveFetch(
          new Response(JSON.stringify({ digitalFormat: { id: TEST_FORMAT_ID, files: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('shows missing status when fetch throws a network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/No MP3 320kbps format found/)).toBeInTheDocument();
      });
    });

    it('displays singular file text for a single file format', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            digitalFormat: {
              id: TEST_FORMAT_ID,
              files: [{ id: 'file-1', trackNumber: 1, title: null, fileName: 'track-1.mp3' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/1 file\b/)).toBeInTheDocument();
      });
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

  describe('featured track dropdown', () => {
    const TEST_RELEASE_ID = 'abc123def456abc123def456';
    const TEST_FORMAT_ID = 'def456abc123def456abc123';

    it('renders featured track dropdown when format files are loaded', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            digitalFormat: {
              id: TEST_FORMAT_ID,
              files: [
                { id: 'file-1', trackNumber: 1, title: 'Track One', fileName: 'track-1.mp3' },
                { id: 'file-2', trackNumber: 2, title: 'Track Two', fileName: 'track-2.mp3' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('featured-track-select')).toBeInTheDocument();
        expect(screen.getByTestId('select-item-1')).toBeInTheDocument();
        expect(screen.getByTestId('select-item-2')).toBeInTheDocument();
      });
    });

    it('does not render featured track dropdown when no format files', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('featured-track-select')).not.toBeInTheDocument();
      });
    });

    it('displays the default placeholder text', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            digitalFormat: {
              id: TEST_FORMAT_ID,
              files: [
                { id: 'file-1', trackNumber: 1, title: 'Track One', fileName: 'track-1.mp3' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Default (Track 1)')).toBeInTheDocument();
      });
    });
  });

  describe('edit mode', () => {
    it('shows loading state when featuredArtistId is provided', () => {
      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.getByText('Loading featured artist...')).toBeInTheDocument();
    });

    it('does not render form fields while loading', () => {
      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.queryByTestId('release-select-releaseId')).not.toBeInTheDocument();
    });
  });
});
