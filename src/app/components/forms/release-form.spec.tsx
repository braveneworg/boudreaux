/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { ReleaseForm } from '@/app/components/forms/release-form';
import { useReleaseDetailQuery } from '@/app/hooks/use-release-query';
import { deleteReleaseAction } from '@/lib/actions/delete-release-action';

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

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => '/admin/releases/new',
}));

// Mock next-auth/react
vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', name: 'Admin', role: 'admin' } },
    status: 'authenticated',
  }),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock server actions
vi.mock('@/lib/actions/create-release-action', () => ({
  createReleaseAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-release-action', () => ({
  updateReleaseAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-release-action', () => ({
  deleteReleaseAction: vi.fn(),
}));
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/actions/register-image-actions', () => ({
  registerReleaseImagesAction: vi.fn(),
}));
vi.mock('@/lib/actions/release-image-actions', () => ({
  deleteReleaseImageAction: vi.fn(),
  reorderReleaseImagesAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFilesToS3: vi.fn(),
}));
vi.mock('@/lib/utils/console-logger', () => ({
  error: vi.fn(),
}));

// Mock the release-detail query hook so edit-mode loading is driven by the
// hook's return value instead of a raw `fetch`. Defaults to "create mode"
// (null data, not pending); edit-mode tests override it per-case.
vi.mock('@/app/hooks/use-release-query', () => ({
  useReleaseDetailQuery: vi.fn(() => ({
    data: null,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

// Mock complex sub-components to keep tests focused
vi.mock('@/app/components/forms/digital-formats-accordion', () => ({
  DigitalFormatsAccordion: () => <div data-testid="digital-formats-accordion" />,
}));
vi.mock('@/app/components/forms/fields/artist-multi-select', () => ({
  ArtistMultiSelect: () => <div data-testid="artist-multi-select" />,
}));
vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  CoverArtField: () => <div data-testid="cover-art-field" />,
}));
vi.mock('@/app/components/ui/image-uploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));
vi.mock('../ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <div data-testid="breadcrumb-menu" />,
}));
vi.mock('../ui/datepicker', () => ({
  DatePicker: ({
    onChange,
    value,
    label,
  }: {
    onChange: (d: string) => void;
    value: string;
    label: string;
  }) => (
    <input
      data-testid={`datepicker-${label?.toLowerCase().replace(/\s+/g, '-')}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  ),
}));

describe('ReleaseForm — suggestedPrice field', () => {
  it('should render the suggested price input field', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Suggested price in dollars')).toBeInTheDocument();
    });
  });

  it('should render with correct label text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByText('Suggested Price (USD)')).toBeInTheDocument();
    });
  });

  it('should render the description text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByText('Optional pay-what-you-want suggested price')).toBeInTheDocument();
    });
  });

  it('should render with placeholder text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g., 7.99')).toBeInTheDocument();
    });
  });

  it('should accept a valid price input', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    await user.type(input, '9.99');

    expect(input).toHaveValue('9.99');
  });

  it('should have decimal inputMode for mobile keyboard', async () => {
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    expect(input).toHaveAttribute('inputMode', 'decimal');
  });

  it('should start with empty value by default', async () => {
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    expect(input).toHaveValue('');
  });
});

describe('ReleaseForm — edit mode', () => {
  const useReleaseDetailQueryMock = vi.mocked(useReleaseDetailQuery);

  afterEach(() => {
    // Restore the default create-mode behavior for other suites.
    useReleaseDetailQueryMock.mockReturnValue({
      data: null,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows the loading skeleton while the release query is pending', () => {
    useReleaseDetailQueryMock.mockReturnValue({
      data: null,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReleaseForm releaseId="rel-1" />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('populates the suggested price from the loaded release (cents → dollars)', async () => {
    useReleaseDetailQueryMock.mockReturnValue({
      data: {
        id: 'rel-1',
        title: 'My Release',
        labels: ['Label A'],
        releasedOn: new Date('2024-01-01T00:00:00.000Z'),
        catalogNumber: 'CAT-1',
        coverArt: 'https://cdn.example.com/cover.jpg',
        description: null,
        downloadUrls: [],
        formats: ['DIGITAL'],
        extendedData: [],
        notes: [],
        executiveProducedBy: [],
        coProducedBy: [],
        masteredBy: [],
        mixedBy: [],
        recordedBy: [],
        artBy: [],
        designBy: [],
        photographyBy: [],
        linerNotesBy: [],
        imageTypes: [],
        variants: [],
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedOn: null,
        publishedAt: null,
        featuredOn: null,
        featuredUntil: null,
        featuredDescription: null,
        tagId: null,
        suggestedPrice: 799,
        images: [],
        artistReleases: [],
        digitalFormats: [],
        releaseUrls: [],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReleaseForm releaseId="rel-1" />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    await waitFor(() => {
      expect(input).toHaveValue('7.99');
    });
  });
});

describe('ReleaseForm — delete (hard)', () => {
  const releaseId = '507f1f77bcf86cd799439011';

  // Opens the EntityDeleteButton's confirmation dialog and clicks its confirm.
  const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Delete Release' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
  };

  beforeEach(() => {
    vi.mocked(deleteReleaseAction).mockResolvedValue({ success: true });
  });

  it('renders a delete button in edit mode', () => {
    render(<ReleaseForm releaseId={releaseId} />);

    expect(screen.getByRole('button', { name: 'Delete Release' })).toBeInTheDocument();
  });

  it('does not render a delete button in create mode', () => {
    render(<ReleaseForm />);

    expect(screen.queryByRole('button', { name: 'Delete Release' })).not.toBeInTheDocument();
  });

  it('deletes the release and navigates to the admin list on success', async () => {
    render(<ReleaseForm releaseId={releaseId} />);

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await confirmDelete(user);

    await waitFor(() => {
      expect(deleteReleaseAction).toHaveBeenCalledWith(releaseId);
    });
    expect(mockPush).toHaveBeenCalledWith('/admin/releases');
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    render(<ReleaseForm releaseId={releaseId} />);

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Delete Release' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deleteReleaseAction).not.toHaveBeenCalled();
  });

  it('shows an error toast when deletion fails', async () => {
    vi.mocked(deleteReleaseAction).mockResolvedValue({
      success: false,
      error: 'Release not found',
    });
    render(<ReleaseForm releaseId={releaseId} />);

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await confirmDelete(user);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Release not found');
    });
  });

  it('shows a generic error toast when the delete action throws', async () => {
    vi.mocked(deleteReleaseAction).mockRejectedValue(new Error('boom'));
    render(<ReleaseForm releaseId={releaseId} />);

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await confirmDelete(user);

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('An unexpected error occurred');
    });
  });
});
