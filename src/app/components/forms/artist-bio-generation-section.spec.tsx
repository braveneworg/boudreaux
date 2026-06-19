/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

import { ArtistBioGenerationSection } from './artist-bio-generation-section';

const generateMock = vi.fn();
vi.mock('@/app/hooks/mutations/use-bio-mutations', () => ({
  useGenerateArtistBioMutation: () => ({ mutateAsync: generateMock, isPending: false }),
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

describe('ArtistBioGenerationSection', () => {
  it('shows the Generate button initially', () => {
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={vi.fn()} />);

    expect(screen.getByRole('button', { name: /generate bios/i })).toBeInTheDocument();
  });

  it('calls onGenerated and shows a preview on success', async () => {
    generateMock.mockResolvedValue({ success: true, data: content });
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(content));
    expect(screen.getByText('A boundary-pushing artist.')).toBeInTheDocument();
    expect(screen.getByAltText('Portrait')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate bios/i })).toBeInTheDocument();
  });

  it('forwards added reference links to the action', async () => {
    generateMock.mockResolvedValue({ success: true, data: content });
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

  it('shows an error toast and no preview when generation fails', async () => {
    generateMock.mockResolvedValue({ success: false, error: 'Bio generation failed' });
    const onGenerated = vi.fn();
    render(<ArtistBioGenerationSection artistId={ARTIST_ID} onGenerated={onGenerated} />);

    await userEvent.click(screen.getByRole('button', { name: /generate bios/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Bio generation failed'));
    expect(onGenerated).not.toHaveBeenCalled();
  });
});
