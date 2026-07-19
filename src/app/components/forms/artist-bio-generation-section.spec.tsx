/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CLIENT_POLL_DEADLINE_MS } from '@/lib/validation/bio-generation-schema';
import type {
  BioGenerationStatusResult,
  GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { ArtistBioGenerationSection } from './artist-bio-generation-section';

const generateMock = vi.fn();
vi.mock('./_hooks/mutations/use-bio-mutations', () => ({
  useGenerateArtistBioMutation: () => ({
    generateArtistBio: vi.fn(),
    generateArtistBioAsync: generateMock,
    isGeneratingArtistBio: false,
    isGenerateArtistBioError: false,
    generateArtistBioError: null,
    generatedArtistBio: undefined,
    resetGenerateArtistBio: vi.fn(),
  }),
}));

const createBioLinkMock = vi.fn();
vi.mock('./_hooks/mutations/use-bio-media-mutations', () => ({
  useCreateBioLinkMutation: () => ({
    createBioLink: createBioLinkMock,
    isCreatingBioLink: false,
  }),
}));

// The polled status drives completion. A module-level value lets each test set
// the status the (enabled) query reports back after generation is triggered.
let statusReturn: BioGenerationStatusResult = { status: null, error: null, content: null };
vi.mock('./_hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: () => ({
    data: statusReturn,
    isPending: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));

// Mock BioHtml so this spec stays on the fast vmThreads pool (the real BioHtml
// pulls in html-react-parser, which requires the forks pool).
vi.mock('@/app/components/bio-html', () => ({
  BioHtml: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (msg: string) => toastError(msg), success: (msg: string) => toastSuccess(msg) },
}));

const content: GeneratedBioContent = {
  shortBio: 'A boundary-pushing artist.',
  longBio: '<p>Long bio.</p>',
  altBio: '<p>Punchy promo blurb.</p>',
  genres: 'experimental',
  images: [
    {
      url: 'https://upload.wikimedia.org/a.jpg',
      thumbnailUrl: 'https://upload.wikimedia.org/thumb/a.jpg',
      title: 'Portrait',
      attribution: 'Wikimedia Commons',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
      isPrimary: true,
    },
  ],
  links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/x', kind: 'wikipedia' }],
  model: 'fake/deterministic',
};

const ARTIST_ID = 'a'.repeat(24);

beforeEach(() => {
  generateMock.mockReset();
  createBioLinkMock.mockReset();
  toastError.mockClear();
  toastSuccess.mockClear();
  statusReturn = { status: null, error: null, content: null };
  generateMock.mockResolvedValue({ success: true, status: 'pending' });
});

describe('ArtistBioGenerationSection', () => {
  it('shows the Generate button initially', () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    expect(screen.getByRole('button', { name: /generate bios/i })).toBeInTheDocument();
  });

  it('populates the form and shows a preview when the job succeeds', async () => {
    statusReturn = { status: 'succeeded', error: null, content };
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(content));
    expect(screen.getByText('A boundary-pushing artist.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate bios/i })).toBeInTheDocument();
  });

  it('shows an in-progress hint while the job is processing', async () => {
    statusReturn = { status: 'processing', error: null, content: null };
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(screen.getByText(/can take a few minutes/i)).toBeInTheDocument());
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('renders the live stage timeline from the polled progress', async () => {
    statusReturn = {
      status: 'processing',
      error: null,
      content: null,
      progress: {
        stage: 'vision-gating',
        counts: { candidates: 3 },
        at: '2026-07-08T00:00:00.000Z',
      },
    };
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() =>
      expect(screen.getByRole('list', { name: /bio generation progress/i })).toBeInTheDocument()
    );
    const active = screen
      .getByRole('list', { name: /bio generation progress/i })
      .querySelector('[aria-current="step"]');
    expect(active).toHaveTextContent('Verifying images');
  });

  it('toasts and does not populate when the job fails', async () => {
    statusReturn = { status: 'failed', error: 'Bio generation failed.', content: null };
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Bio generation failed.'));
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('forwards added reference links to the trigger', async () => {
    statusReturn = { status: 'succeeded', error: null, content };
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/reference links/i), 'https://artist.example');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() =>
      expect(generateMock).toHaveBeenCalledWith(
        expect.objectContaining({ links: ['https://artist.example'] })
      )
    );
  });

  it('rejects a non-http reference link', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/reference links/i), 'not-a-url');
    await userEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(toastError).toHaveBeenCalledWith('Links must start with http:// or https://');
  });

  it('shows an error toast when the trigger itself fails', async () => {
    generateMock.mockResolvedValue({ success: false, error: 'Bio generation failed to start.' });
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Bio generation failed to start.'));
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('adds a link when Enter is pressed in the input', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    const input = screen.getByLabelText(/reference links/i);
    await userEvent.type(input, 'https://artist.example{Enter}');

    expect(screen.getByText('https://artist.example')).toBeInTheDocument();
  });

  it('does not add a duplicate link', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    const input = screen.getByLabelText(/reference links/i);
    await userEvent.type(input, 'https://artist.example{Enter}');
    await userEvent.type(input, 'https://artist.example{Enter}');

    expect(screen.getAllByText('https://artist.example')).toHaveLength(1);
  });

  it('ignores an empty link draft', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    const input = screen.getByLabelText(/reference links/i);
    await userEvent.type(input, '   {Enter}');

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('removes an added link via its remove button', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    const input = screen.getByLabelText(/reference links/i);
    await userEvent.type(input, 'https://artist.example{Enter}');
    await userEvent.click(
      screen.getByRole('button', { name: /remove https:\/\/artist\.example/i })
    );

    expect(screen.queryByText('https://artist.example')).not.toBeInTheDocument();
  });

  it('forwards the typed description to the trigger', async () => {
    statusReturn = { status: 'succeeded', error: null, content };
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/additional description/i), 'Hometown hero');
    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() =>
      expect(generateMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Hometown hero' })
      )
    );
  });

  // The discovered links/images now live in the palettes rendered by
  // `BioMediaPalettes` (bio-media-palettes.spec.tsx); the preview only keeps
  // the short bio and a note pointing at them.
  it('does not render discovered-media lists in the preview', async () => {
    statusReturn = { status: 'succeeded', error: null, content };
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(screen.getByText('A boundary-pushing artist.')).toBeInTheDocument());
    expect(screen.queryByText('Discovered links')).not.toBeInTheDocument();
  });

  it('points the regenerate note at the palettes', async () => {
    statusReturn = { status: 'succeeded', error: null, content };
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/regenerating replaces the palette images and links/i)
      ).toBeInTheDocument()
    );
  });

  it('persists an added reference link so it joins the palette', async () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    await userEvent.type(
      screen.getByLabelText(/reference links/i),
      'https://www.pitchfork.com/artist{Enter}'
    );

    expect(createBioLinkMock).toHaveBeenCalledWith({
      artistId: ARTIST_ID,
      label: 'pitchfork.com',
      url: 'https://www.pitchfork.com/artist',
    });
  });

  it('times out the UI when a triggered run never reaches a terminal status', async () => {
    // Status stays `processing` forever (server never returns a terminal status,
    // e.g. its endpoint is unreachable). The form must still resolve rather than
    // show the working state and poll indefinitely.
    vi.useFakeTimers();
    try {
      statusReturn = { status: 'processing', error: null, content: null };
      render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /generate bios/i }));
      // Flush the fire-and-forget generate() so `active` flips true and arms the timer.
      await act(async () => {});

      await act(async () => {
        vi.advanceTimersByTime(CLIENT_POLL_DEADLINE_MS + 1000);
      });

      expect(toastError).toHaveBeenCalledWith('Bio generation timed out. Please try again.');
    } finally {
      vi.useRealTimers();
    }
  });
});
