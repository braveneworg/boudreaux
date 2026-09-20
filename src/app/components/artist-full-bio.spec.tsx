/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';

import { ArtistFullBio } from './artist-full-bio';

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

// Mock BioHtml so this spec stays on the fast vmThreads pool (the real one
// pulls in html-react-parser, which requires the forks pool).
vi.mock('./bio-html', () => ({
  BioHtml: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}));

type BioImage = ArtistWithPublishedReleases['bioImages'][number];

const image = (id: string, overrides: Partial<BioImage> = {}): BioImage =>
  ({
    id,
    url: `https://cdn.test/${id}.jpg`,
    thumbnailUrl: null,
    title: null,
    attribution: null,
    license: null,
    licenseUrl: null,
    sourceUrl: null,
    alt: null,
    isPrimary: false,
    displayOrder: null,
    ...overrides,
  }) as BioImage;

describe('ArtistFullBio', () => {
  it('heads the section so the biography is findable on the artist page', () => {
    render(<ArtistFullBio displayName="Test Artist" bioImages={[]} bio="<p>The long bio.</p>" />);

    expect(screen.getByRole('heading', { name: 'Biography' })).toBeInTheDocument();
  });

  it('renders the long bio', () => {
    render(<ArtistFullBio displayName="Test Artist" bioImages={[]} bio="<p>The long bio.</p>" />);

    expect(screen.getByText('The long bio.')).toBeInTheDocument();
  });

  it('renders every bio image as an expandable thumbnail, not just the chosen ones', () => {
    render(
      <ArtistFullBio
        displayName="Test Artist"
        bioImages={[image('a'), image('b'), image('c')]}
        bio={null}
      />
    );

    expect(screen.getAllByTestId('thumb')).toHaveLength(3);
  });

  it('prefers an image’s alt text over its title', () => {
    render(
      <ArtistFullBio
        displayName="Test Artist"
        bioImages={[image('a', { title: 'Portrait', alt: 'On stage' })]}
        bio={null}
      />
    );

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'On stage');
  });

  it('falls back to the display name when an image has neither alt nor title', () => {
    render(<ArtistFullBio displayName="Test Artist" bioImages={[image('a')]} bio={null} />);

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Test Artist image');
  });

  it('says so plainly when no biography has been written', () => {
    render(<ArtistFullBio displayName="Test Artist" bioImages={[]} bio={null} />);

    expect(
      screen.getByText('No biography has been written for this artist yet.')
    ).toBeInTheDocument();
  });

  it('omits the image gallery when there are no images', () => {
    render(<ArtistFullBio displayName="Test Artist" bioImages={[]} bio="<p>Bio.</p>" />);

    expect(screen.queryByRole('list', { name: 'Artist images' })).not.toBeInTheDocument();
  });
});
