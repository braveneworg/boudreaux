/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  BioGenerationStatusResult,
  GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { ArtistBioGenerationSection } from './artist-bio-generation-section';

const generateMock = vi.fn();
vi.mock('@/app/hooks/mutations/use-bio-mutations', () => ({
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

// The polled status drives completion. A module-level value lets each test set
// the status the (enabled) query reports back after generation is triggered.
let statusReturn: BioGenerationStatusResult = { status: null, error: null, content: null };
vi.mock('@/app/hooks/use-artist-bio-generation-status-query', () => ({
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
    expect(screen.getByAltText('Portrait')).toBeInTheDocument();
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
});
