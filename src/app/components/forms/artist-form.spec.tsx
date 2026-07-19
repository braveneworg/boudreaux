/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { archiveArtistAction } from '@/lib/actions/archive-artist-action';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

import { useArtistBioGenerationStatusQuery } from './_hooks/use-artist-bio-generation-status-query';
import { ArtistForm } from './artist-form';

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

// The previous suite (see git history) mocked react-hook-form's `control`,
// which never satisfied the Control interface and broke the tests. We keep
// react-hook-form real and instead stub the leaf field components so the real
// `control` is simply forwarded to a stub that ignores it — the approach used
// by featured-artist-form.spec.tsx.

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => ({ data: { user: { id: 'admin-1', role: 'admin' } }, status: 'authenticated' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({ name, label }: { name: string; label: string }) => (
    <div data-testid={`text-field-${name}`}>{label}</div>
  ),
}));

// Mock BioHtml (pulled in transitively via the bio-generation section) so this
// spec stays on the fast vmThreads pool; the real BioHtml needs the forks pool.
vi.mock('@/app/components/bio-html', () => ({
  BioHtml: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

vi.mock('@/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <div data-testid="breadcrumb-menu">BreadcrumbMenu</div>,
}));

vi.mock('@/ui/datepicker', () => ({
  DatePicker: () => <div data-testid="date-picker">DatePicker</div>,
}));

// Server actions are mocked so their `server-only` imports never load and no
// network/DB work runs on render.
vi.mock('@/lib/actions/create-artist-action', () => ({ createArtistAction: vi.fn() }));
vi.mock('@/lib/actions/update-artist-action', () => ({ updateArtistAction: vi.fn() }));
vi.mock('@/lib/actions/archive-artist-action', () => ({ archiveArtistAction: vi.fn() }));
vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn(), warn: vi.fn(), log: vi.fn() }));

// uploadBioImage pulls in server-only actions transitively; stub it here.
vi.mock('@/app/components/forms/utils/upload-bio-image', () => ({
  uploadBioImage: vi.fn(),
}));

// Stub ArtistBioSection to capture props without rendering the full bio editor
// tree (which needs next/dynamic + tiptap). Exposes bioEditorImages so tests
// can assert which images the picker is seeded with, and a trigger button that
// fires `onBioGenerated` so the generated-image source can be exercised.
vi.mock('@/app/components/forms/sections/artist-bio-section', () => ({
  ArtistBioSection: ({
    onUploadImage,
    bioEditorImages,
    onBioGenerated,
  }: {
    onUploadImage?: (...args: unknown[]) => unknown;
    bioEditorImages?: { url: string; alt: string }[];
    onBioGenerated?: (content: GeneratedBioContent) => void;
  }) => (
    <div
      data-testid="artist-bio-section-stub"
      data-has-upload-handler={onUploadImage != null ? 'true' : 'false'}
      data-bio-editor-images={JSON.stringify(bioEditorImages ?? [])}
    >
      <button
        type="button"
        data-testid="trigger-bio-generated"
        onClick={() =>
          onBioGenerated?.({
            shortBio: '',
            longBio: '',
            altBio: '',
            genres: null,
            images: [{ url: 'https://cdn/x.webp', title: 'generated', isPrimary: false }],
            links: [],
            model: 'gemini-2.5-flash',
          })
        }
      />
    </div>
  ),
}));

// The bio palettes keep the generation-status query mounted in edit mode;
// stub the hook so this suite never issues a real fetch and renders no tiles.
vi.mock('./_hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: vi.fn(() => ({
    data: undefined,
    isPending: true,
    error: Error('Unknown error'),
    refetch: vi.fn(),
  })),
}));

// Mock the artist-detail query hook so edit-mode loading is driven by the
// hook's return value instead of a raw `fetch`. Create-mode tests below leave
// it at the default (null data, not pending).
vi.mock('./_hooks/use-artist-query', () => ({
  useArtistQuery: vi.fn(() => ({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

describe('ArtistForm', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  describe('create mode', () => {
    it('renders the create-mode title', () => {
      render(<ArtistForm />);

      expect(screen.getByText('Create New Artist')).toBeInTheDocument();
    });

    it('renders the required-fields hint instead of the edit-mode copy', () => {
      render(<ArtistForm />);

      expect(screen.getByText('Required fields are marked with an asterisk *')).toBeInTheDocument();
    });

    it('renders the name fields', () => {
      render(<ArtistForm />);

      expect(screen.getByTestId('text-field-title')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-surname')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-displayName')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-slug')).toBeInTheDocument();
    });

    it('does not render the removed artist images section', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('heading', { name: 'Images' })).not.toBeInTheDocument();
    });

    it('renders the breadcrumb menu', () => {
      render(<ArtistForm />);

      expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    });

    it('renders the Create & Publish action button', () => {
      render(<ArtistForm />);

      expect(screen.getByRole('button', { name: /create & publish/i })).toBeInTheDocument();
    });

    it('does not render a delete button in create mode', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('button', { name: 'Delete Artist' })).not.toBeInTheDocument();
    });
  });

  describe('delete (soft / archive)', () => {
    const artistId = '507f1f77bcf86cd799439011';

    // Opens the EntityDeleteButton's confirmation dialog and clicks its confirm.
    const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    };

    beforeEach(() => {
      vi.mocked(archiveArtistAction).mockResolvedValue({ success: true });
    });

    it('renders a delete button in edit mode', () => {
      render(<ArtistForm artistId={artistId} />);

      expect(screen.getByRole('button', { name: 'Delete Artist' })).toBeInTheDocument();
    });

    it('archives the artist and navigates to the admin list on success', async () => {
      render(<ArtistForm artistId={artistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(archiveArtistAction).toHaveBeenCalledWith(artistId);
      });
      expect(mockPush).toHaveBeenCalledWith('/admin/artists');
    });

    it('does not archive when the confirmation dialog is cancelled', async () => {
      render(<ArtistForm artistId={artistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: 'Delete Artist' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(archiveArtistAction).not.toHaveBeenCalled();
    });

    it('shows an error toast when archiving fails', async () => {
      vi.mocked(archiveArtistAction).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });
      render(<ArtistForm artistId={artistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Artist not found');
      });
    });

    it('shows a generic error toast when the archive action throws', async () => {
      vi.mocked(archiveArtistAction).mockRejectedValue(new Error('boom'));
      render(<ArtistForm artistId={artistId} />);

      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await confirmDelete(user);

      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('An unexpected error occurred');
      });
    });
  });

  describe('onUploadImage wiring', () => {
    it('does not pass onUploadImage to ArtistBioSection in create mode (no artistId)', () => {
      render(<ArtistForm />);

      expect(screen.getByTestId('artist-bio-section-stub')).toHaveAttribute(
        'data-has-upload-handler',
        'false'
      );
    });

    it('passes onUploadImage to ArtistBioSection in edit mode (with artistId)', () => {
      render(<ArtistForm artistId="artist-123" />);

      expect(screen.getByTestId('artist-bio-section-stub')).toHaveAttribute(
        'data-has-upload-handler',
        'true'
      );
    });
  });

  describe('bio editor images from library', () => {
    /** Minimal succeeded-status response with one library image. */
    const libraryStatusData = {
      data: {
        status: 'succeeded' as const,
        error: null,
        content: {
          shortBio: '',
          longBio: '',
          altBio: '',
          genres: null,
          images: [
            {
              id: 'lib-1',
              url: 'https://cdn/x.webp',
              attribution: null,
              isPrimary: false,
            },
          ],
          links: [],
          model: 'gemini-2.5-flash',
        },
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    };

    it('passes persisted library images from the status query to bioEditorImages', () => {
      vi.mocked(useArtistBioGenerationStatusQuery).mockReturnValue(libraryStatusData);

      render(<ArtistForm artistId="artist-123" />);

      const stub = screen.getByTestId('artist-bio-section-stub');
      const images = JSON.parse(stub.getAttribute('data-bio-editor-images') ?? '[]') as {
        url: string;
      }[];
      expect(images.some((img) => img.url === 'https://cdn/x.webp')).toBe(true);
    });

    it('deduplicates a URL present in both generated and library images', async () => {
      vi.mocked(useArtistBioGenerationStatusQuery).mockReturnValue(libraryStatusData);

      render(<ArtistForm artistId="artist-123" />);

      // The generated-bio trigger fires onBioGenerated with the same URL the
      // library already holds; bioEditorImages must dedupe it to a single entry.
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('trigger-bio-generated'));

      await waitFor(() => {
        const stub = screen.getByTestId('artist-bio-section-stub');
        const images = JSON.parse(stub.getAttribute('data-bio-editor-images') ?? '[]') as {
          url: string;
        }[];
        expect(images.filter((img) => img.url === 'https://cdn/x.webp')).toHaveLength(1);
      });
    });
  });
});
