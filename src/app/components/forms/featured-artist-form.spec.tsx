/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { deleteFeaturedArtistAction } from '@/lib/actions/delete-featured-artist-action';

import { useFeaturedArtistQuery } from './_hooks/use-featured-artist-query';
import {
  useReleaseDigitalFormatQuery,
  type ReleaseDigitalFormat,
} from './_hooks/use-release-digital-format-query';
import { FeaturedArtistForm } from './featured-artist-form';

import type * as ReactHookFormTypes from 'react-hook-form';

/**
 * Render helper that wraps the form in a fresh TanStack Query client so the
 * mutation hooks the form now uses have a provider in scope. Mirrors the
 * `render` signature so existing call sites are unchanged.
 */
const render = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return rtlRender(ui, { wrapper: Wrapper });
};

// Capture props passed to mocked ReleaseSelect
let capturedReleaseSelectSetValue:
  | ((name: string, value: string, options?: Record<string, boolean>) => void)
  | undefined;

// Spy for react-hook-form setValue
const mockSetValue = vi.fn();

const mockPush = vi.fn();
const mockRefresh = vi.fn();

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
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/actions/create-featured-artist-action', () => ({
  createFeaturedArtistAction: vi.fn(),
}));

vi.mock('@/lib/actions/delete-featured-artist-action', () => ({
  deleteFeaturedArtistAction: vi.fn(),
}));

vi.mock('@/lib/utils/console-logger', () => ({
  error: vi.fn(),
}));

// Mock the featured-artist query hook so edit-mode loading is driven by the
// hook's return value instead of a raw `fetch`. Defaults to "create mode"
// (null data, not pending); edit-mode tests override it per-case.
vi.mock('./_hooks/use-featured-artist-query', () => ({
  useFeaturedArtistQuery: vi.fn(() => ({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock the release-digital-format query hook so the featured-track auto-fetch
// path is driven by the hook's return value instead of a raw `fetch`. Defaults
// to "no format found" (null data, not pending); each digital-format test
// overrides it per-case.
vi.mock('./_hooks/use-release-digital-format-query', () => ({
  useReleaseDigitalFormatQuery: vi.fn(() => ({
    data: null,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock form field subcomponents as simple stubs, capturing props we care about
vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({ name, label }: { name: string; label: string }) => (
    <div data-testid={`text-field-${name}`}>{label}</div>
  ),
}));

vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  CoverArtField: ({ name }: { name: string }) => (
    <div data-testid={`cover-art-field-${name}`}>CoverArtField</div>
  ),
}));

vi.mock('@/app/components/forms/fields/release-select', () => ({
  ReleaseSelect: ({
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

/**
 * Builds a fully-typed digital-format fixture matching the hook's `data` shape.
 * The component only reads `id` and `files[].{ trackNumber, title, fileName }`,
 * but every schema field is supplied so the literal satisfies
 * `ReleaseDigitalFormat` without a cast.
 */
const TEST_DATE = new Date('2024-01-01T00:00:00.000Z');

const makeFormat = (id: string, fileCount: number): ReleaseDigitalFormat => ({
  id,
  releaseId: 'release-1',
  formatType: 'MP3_320KBPS',
  s3Key: null,
  fileName: null,
  fileSize: null,
  mimeType: null,
  trackCount: fileCount,
  totalFileSize: null,
  checksum: null,
  deletedAt: null,
  uploadedAt: TEST_DATE,
  createdAt: TEST_DATE,
  updatedAt: TEST_DATE,
  files: Array.from({ length: fileCount }, (_, i) => ({
    id: `file-${i}`,
    formatId: id,
    trackNumber: i + 1,
    title: null,
    duration: null,
    s3Key: 'k',
    fileName: `track-${i + 1}.mp3`,
    fileSize: 1n,
    mimeType: 'audio/mpeg',
    checksum: null,
    uploadedAt: TEST_DATE,
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
  })),
});

describe('FeaturedArtistForm', () => {
  beforeEach(() => {
    mockSetValue.mockClear();
    capturedReleaseSelectSetValue = undefined;
    _capturedSelectOnValueChange = undefined;
    vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
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
      expect(screen.getByRole('button', { name: 'Create Featured Artist' })).toBeInTheDocument();
    });
  });

  describe('digital format auto-fetch on release selection', () => {
    const TEST_RELEASE_ID = 'abc123def456abc123def456';
    const TEST_FORMAT_ID = 'def456abc123def456abc123';

    it('auto-sets digitalFormatId when release has MP3_320KBPS format', async () => {
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: makeFormat(TEST_FORMAT_ID, 2),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<FeaturedArtistForm />);

      await act(() => {
        capturedReleaseSelectSetValue?.('releaseId', TEST_RELEASE_ID, {
          shouldDirty: true,
          shouldValidate: true,
        });
      });

      await waitFor(() => {
        expect(useReleaseDigitalFormatQuery).toHaveBeenCalledWith(
          TEST_RELEASE_ID,
          'MP3_320KBPS',
          expect.objectContaining({ enabled: true })
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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: makeFormat(TEST_FORMAT_ID, 3),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
    });

    it('shows missing status when fetch throws a network error', async () => {
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('Network failure'),
        refetch: vi.fn(),
      });

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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: makeFormat(TEST_FORMAT_ID, 1),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockPush).toHaveBeenCalledWith('/admin/featured-artists');
    });
  });

  describe('featured track dropdown', () => {
    const TEST_RELEASE_ID = 'abc123def456abc123def456';
    const TEST_FORMAT_ID = 'def456abc123def456abc123';

    it('renders featured track dropdown when format files are loaded', async () => {
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: makeFormat(TEST_FORMAT_ID, 2),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
      vi.mocked(useReleaseDigitalFormatQuery).mockReturnValue({
        data: makeFormat(TEST_FORMAT_ID, 1),
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

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
    const useFeaturedArtistQueryMock = vi.mocked(useFeaturedArtistQuery);

    afterEach(() => {
      // Restore the default create-mode behavior for other suites.
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('shows loading state while the featured-artist query is pending', () => {
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.getByText('Loading featured artist...')).toBeInTheDocument();
    });

    it('does not render form fields while loading', () => {
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      expect(screen.queryByTestId('release-select-releaseId')).not.toBeInTheDocument();
    });

    it('does not show a load-error toast on a successful load', async () => {
      // The hook defaults `error` to a non-null Error even on success, so the
      // toast must gate on `isError` — not on the truthy `error` value.
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: new Error('Unknown error'),
        refetch: vi.fn(),
      });

      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      await waitFor(() => {
        expect(screen.queryByText('Loading featured artist...')).not.toBeInTheDocument();
      });
      expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(
        'Failed to load featured artist data'
      );
    });

    it('shows a load-error toast when the query errors', async () => {
      useFeaturedArtistQueryMock.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('boom'),
        refetch: vi.fn(),
      });

      render(<FeaturedArtistForm featuredArtistId="existing-id-123" />);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to load featured artist data');
      });
    });
  });

  describe('delete', () => {
    const useFeaturedArtistQueryMock = vi.mocked(useFeaturedArtistQuery);
    const featuredArtistId = '507f1f77bcf86cd799439011';

    // Opens the EntityDeleteButton's confirmation dialog and clicks its confirm.
    const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Delete Featured Artist' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    };

    beforeEach(() => {
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      vi.mocked(deleteFeaturedArtistAction).mockResolvedValue({ success: true });
    });

    afterEach(() => {
      useFeaturedArtistQueryMock.mockReturnValue({
        data: null,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('renders a delete button in edit mode', () => {
      render(<FeaturedArtistForm featuredArtistId={featuredArtistId} />);

      expect(screen.getByRole('button', { name: 'Delete Featured Artist' })).toBeInTheDocument();
    });

    it('does not render a delete button in create mode', () => {
      render(<FeaturedArtistForm />);

      expect(
        screen.queryByRole('button', { name: 'Delete Featured Artist' })
      ).not.toBeInTheDocument();
    });

    it('deletes the featured artist and navigates to the admin list on success', async () => {
      render(<FeaturedArtistForm featuredArtistId={featuredArtistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(deleteFeaturedArtistAction).toHaveBeenCalledWith(featuredArtistId);
      });
      expect(mockPush).toHaveBeenCalledWith('/admin/featured-artists');
    });

    it('does not delete when the confirmation dialog is cancelled', async () => {
      render(<FeaturedArtistForm featuredArtistId={featuredArtistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: 'Delete Featured Artist' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(deleteFeaturedArtistAction).not.toHaveBeenCalled();
    });

    it('shows an error toast when deletion fails', async () => {
      vi.mocked(deleteFeaturedArtistAction).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
      });
      render(<FeaturedArtistForm featuredArtistId={featuredArtistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Featured artist not found');
      });
    });

    it('shows a generic error toast when the delete action throws', async () => {
      vi.mocked(deleteFeaturedArtistAction).mockRejectedValue(new Error('boom'));
      render(<FeaturedArtistForm featuredArtistId={featuredArtistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('An unexpected error occurred');
      });
    });
  });
});
