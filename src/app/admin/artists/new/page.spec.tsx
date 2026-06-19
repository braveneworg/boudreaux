/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import NewArtistPage from './page';

// redirect must throw to halt execution like the real Next.js redirect.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/app/components/forms/artist-form', () => ({
  ArtistForm: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="artist-form" data-return-to={returnTo ?? ''}>
      artist form
    </div>
  ),
}));

describe('NewArtistPage', () => {
  it('redirects to the artist list when there is no release context', async () => {
    await expect(NewArtistPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/admin/artists'
    );
    expect(mockRedirect).toHaveBeenCalledWith('/admin/artists');
  });

  it('renders the form when launched from a release', async () => {
    render(
      await NewArtistPage({
        searchParams: Promise.resolve({
          releaseId: 'rel-1',
          returnTo: '/admin/releases/rel-1',
        }),
      })
    );

    expect(screen.getByTestId('artist-form')).toHaveAttribute(
      'data-return-to',
      '/admin/releases/rel-1'
    );
  });

  it('allows the form when only a returnTo is supplied', async () => {
    render(
      await NewArtistPage({
        searchParams: Promise.resolve({ returnTo: '/admin/releases/rel-2' }),
      })
    );

    expect(screen.getByTestId('artist-form')).toBeInTheDocument();
  });
});
