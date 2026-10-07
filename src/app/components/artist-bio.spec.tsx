/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistBio } from './artist-bio';
import { BIO_PROSE_CLASS } from './bio-html';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('ArtistBio', () => {
  it('is an article named by its Biography heading', () => {
    render(<ArtistBio html="<p>Born in a van.</p>" />);

    const article = screen.getByRole('article', { name: 'Biography' });
    expect(screen.getByRole('heading', { level: 2, name: 'Biography' })).toBeInTheDocument();
    expect(article).toHaveTextContent('Born in a van.');
  });

  it('renders the prose with the class the editor preview shares', () => {
    render(<ArtistBio html="<p>Prose</p>" />);

    expect(screen.getByText('Prose').parentElement).toHaveClass(...BIO_PROSE_CLASS.split(' '));
  });

  it('says when there is no biography yet', () => {
    render(<ArtistBio html={null} />);

    expect(screen.getByText('No biography yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Biography' })).toBeInTheDocument();
  });
});
