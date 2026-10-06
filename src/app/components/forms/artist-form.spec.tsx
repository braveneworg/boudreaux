/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { archiveArtistAction } from '@/lib/actions/archive-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

import { useArtistPool } from './_hooks/use-artist-pool';
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

const hidingWarning = vi.hoisted(() => ({
  confirmHiding: vi.fn(() => Promise.resolve(true)),
  work: null,
  confirm: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/hooks/use-hiding-warning', () => ({
  useHidingWarning: () => hidingWarning,
}));

vi.mock('@/hooks/use-session', () => ({
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
// The link editors have their own specs; here only their presence per mode
// and the arrays the form hands them matter.
vi.mock('@/app/components/forms/sections/artist-links-section', async () => {
  const { useWatch } = await import('react-hook-form');
  const ArtistLinksSection = ({ control }: { control: never }) => (
    <div
      data-testid="artist-links-section-stub"
      data-groups={JSON.stringify(useWatch({ control, name: 'contactLinkGroups' }) ?? null)}
    />
  );
  return { ArtistLinksSection };
});

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

// The form renders the artist pool module for the editors' image picker and
// the editor upload; stub it so this suite never issues a real fetch.
vi.mock('./_hooks/use-artist-pool', () => ({
  useArtistPool: vi.fn(() => ({
    images: [],
    chosenIds: [],
    add: vi.fn().mockResolvedValue(null),
    addError: null,
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

    // ADR-0020: links hang off a persisted artist, so the create form has no editors.
    it('does not render the links section', () => {
      render(<ArtistForm />);

      expect(screen.queryByTestId('artist-links-section-stub')).not.toBeInTheDocument();
    });

    it('does not render the removed artist images section', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('heading', { name: 'Images' })).not.toBeInTheDocument();
    });

    it('renders the breadcrumb menu', () => {
      render(<ArtistForm />);

      expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    });

    // An artist is created unpublished and published once it has a chosen
    // display image (ADR-0019): there is no create-and-publish button.
    it('offers no Create & Publish button', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });

    it('does not render a delete button in create mode', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('button', { name: 'Delete Artist' })).not.toBeInTheDocument();
    });
  });

  describe('links (ADR-0020)', () => {
    it('renders the links section in edit mode', () => {
      render(<ArtistForm artistId="507f1f77bcf86cd799439011" />);

      expect(screen.getByTestId('artist-links-section-stub')).toBeInTheDocument();
    });

    // The update action composes `links` only when all three arrays arrive;
    // the form's own defaults must carry them, so a save in the moment
    // between a create and the loaded edit form never drops a link.
    it('seeds the three link arrays before the artist has loaded', () => {
      render(<ArtistForm artistId="507f1f77bcf86cd799439011" />);

      expect(
        JSON.parse(screen.getByTestId('artist-links-section-stub').dataset.groups ?? 'null')
      ).toEqual([
        { heading: 'Booking', links: [] },
        { heading: 'Merch', links: [] },
      ]);
    });
  });

  describe('publishing', () => {
    // The defect this guards: Publish wrote the publish date into the form
    // before validating, a refused publish left it there (dirty), and the
    // next plain Save — enabled by that dirty date — published the artist.
    // An edit form with no name fails validation, so Publish is refused here.
    it('leaves nothing for Save to send after a refused publish', async () => {
      vi.mocked(useArtistPool).mockReturnValue({
        images: [],
        chosenIds: ['img-1'],
        add: vi.fn().mockResolvedValue(null),
        addError: null,
      } as never);
      render(<ArtistForm artistId="507f1f77bcf86cd799439011" />);
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

      await user.click(screen.getByRole('button', { name: 'Publish' }));
      await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(vi.mocked(updateArtistAction)).not.toHaveBeenCalled();
    });

    // ADR-0019: publishing needs a chosen display image; the button says why.
    it('disables Publish with the reason while no display image is chosen', () => {
      render(<ArtistForm artistId="507f1f77bcf86cd799439011" />);

      const publish = screen.getByRole('button', { name: 'Publish' });
      expect(publish).toBeDisabled();
      expect(publish).toHaveAccessibleDescription(/display image/i);
    });

    it('enables Publish once a display image is chosen', () => {
      vi.mocked(useArtistPool).mockReturnValue({
        images: [],
        chosenIds: ['img-1'],
        add: vi.fn().mockResolvedValue(null),
        addError: null,
      } as never);
      render(<ArtistForm artistId="507f1f77bcf86cd799439011" />);

      expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
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

    describe('hiding warning (ADR-0015)', () => {
      afterEach(() => {
        hidingWarning.confirmHiding.mockReset();
        hidingWarning.confirmHiding.mockResolvedValue(true);
      });

      it('warns about the public work that will lose the name first', async () => {
        render(<ArtistForm artistId={artistId} />);
        const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

        await confirmDelete(user);

        await waitFor(() => expect(hidingWarning.confirmHiding.mock.calls).toEqual([[artistId]]));
      });

      it('archives nothing when the admin cancels the warning', async () => {
        hidingWarning.confirmHiding.mockResolvedValue(false);
        render(<ArtistForm artistId={artistId} />);
        const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

        await confirmDelete(user);
        await waitFor(() => expect(hidingWarning.confirmHiding).toHaveBeenCalled());

        expect(vi.mocked(archiveArtistAction).mock.calls).toEqual([]);
      });
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

  describe('bio editor images from the pool', () => {
    it('offers every pool image to the bio editors, alt first then title', () => {
      vi.mocked(useArtistPool).mockReturnValue({
        images: [
          { id: 'p-1', url: 'https://cdn/x.webp', alt: 'Alt text', title: 'Title' },
          { id: 'p-2', url: 'https://cdn/y.webp', alt: null, title: 'Only title' },
        ],
        chosenIds: [],
        add: vi.fn().mockResolvedValue(null),
        addError: null,
      } as never);
      render(<ArtistForm artistId="artist-123" />);
      const stub = screen.getByTestId('artist-bio-section-stub');
      expect(JSON.parse(stub.getAttribute('data-bio-editor-images') ?? '[]')).toEqual([
        { url: 'https://cdn/x.webp', alt: 'Alt text' },
        { url: 'https://cdn/y.webp', alt: 'Only title' },
      ]);
    });
  });

  describe('a finished generation', () => {
    it('toasts that the bios are saved once the generated content is adopted', async () => {
      render(<ArtistForm artistId="artist-123" />);
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByTestId('trigger-bio-generated'));
      await waitFor(() =>
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Bios generated and saved.')
      );
    });
  });
});
