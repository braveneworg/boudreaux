/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  BioGenerationStatusResponse,
  BioStatusImage,
  BioStatusLink,
} from '@/lib/validation/bio-generation-schema';

import { BioMediaPalettes } from './bio-media-palettes';

const statusMock = vi.hoisted(() => vi.fn());
const deleteBioLink = vi.hoisted(() => vi.fn());
const deleteBioImage = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ link: false, image: false }));

vi.mock('@/app/hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: (artistId: string) => statusMock(artistId),
}));

vi.mock('@/app/hooks/mutations/use-bio-media-mutations', () => ({
  useDeleteBioLinkMutation: () => ({ deleteBioLink, isDeletingBioLink: pending.link }),
  useDeleteBioImageMutation: () => ({ deleteBioImage, isDeletingBioImage: pending.image }),
}));

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

const LINK_ROW: BioStatusLink = {
  id: 'l1',
  label: 'Wikipedia',
  url: 'https://en.wikipedia.org/wiki/X',
  kind: 'wikipedia',
};

const IMAGE_ROW: BioStatusImage = {
  id: 'i1',
  url: 'https://upload.wikimedia.org/a.jpg',
  thumbnailUrl: null,
  title: 'Portrait',
  attribution: 'Wikimedia Commons',
  isPrimary: true,
};

const contentWith = (
  links: BioStatusLink[],
  images: BioStatusImage[]
): NonNullable<BioGenerationStatusResponse['content']> => ({
  shortBio: '<p>Short.</p>',
  longBio: '<p>Long.</p>',
  altBio: '<p>Alt.</p>',
  genres: null,
  images,
  links,
  model: 'fake/deterministic',
});

const mockStatus = (data: BioGenerationStatusResponse | undefined): void => {
  statusMock.mockReturnValue({
    data,
    isPending: false,
    error: Error('Unknown error'),
    refetch: vi.fn(),
  });
};

beforeEach(() => {
  pending.link = false;
  pending.image = false;
  mockStatus({
    status: 'succeeded',
    error: null,
    content: contentWith([LINK_ROW], [IMAGE_ROW]),
  });
});

describe('BioMediaPalettes', () => {
  it('reads the status for the given artist', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(statusMock).toHaveBeenCalledWith('artist-1');
  });

  it('renders the link palette when generated content exists', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
  });

  it('renders the image palette when generated content exists', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered images' })).toBeInTheDocument();
  });

  it('renders nothing when the artist has no generated content', () => {
    mockStatus({ status: null, error: null, content: null });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while a generation job is still processing', () => {
    mockStatus({ status: 'processing', error: null, content: null });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the status query resolves', () => {
    mockStatus(undefined);

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the content has no links and no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], []) });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('omits the link palette when there are no links', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], [IMAGE_ROW]) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('group', { name: 'Discovered links' })).not.toBeInTheDocument();
  });

  it('omits the image palette when there are no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([LINK_ROW], []) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('group', { name: 'Discovered images' })).not.toBeInTheDocument();
  });

  it('routes a link delete through the mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: `Delete link ${LINK_ROW.label}` }));

    expect(deleteBioLink).toHaveBeenCalledWith(LINK_ROW.id);
  });

  it('routes an image delete through the mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete image Portrait' }));

    expect(deleteBioImage).toHaveBeenCalledWith(IMAGE_ROW.id);
  });

  it('disables image deletes while a link delete is pending', () => {
    pending.link = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Delete image Portrait' })).toBeDisabled();
  });

  it('disables link deletes while an image delete is pending', () => {
    pending.image = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled();
  });
});
