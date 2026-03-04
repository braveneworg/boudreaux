/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistReleaseInfo } from './artist-release-info';

describe('ArtistReleaseInfo', () => {
  it('should render the artist name in a screen-reader-only heading', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Test Artist');
    expect(heading).toHaveClass('sr-only');
  });

  it('should set the correct aria-label on the heading', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist - Test Album');
  });

  it('should render the release title in italics', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const em = screen.getByText('Test Album');
    expect(em.tagName).toBe('EM');
  });

  it('should render a separator', () => {
    const { container } = render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const separator = container.querySelector('[data-slot="separator"]');
    expect(separator).toBeInTheDocument();
  });

  it('should handle empty title', () => {
    render(<ArtistReleaseInfo artistName="Test Artist" title="" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist - ');
  });

  it('should handle empty artist name', () => {
    render(<ArtistReleaseInfo artistName="" title="Test Album" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing:  - Test Album');
  });

  it('should render inside an article element', () => {
    const { container } = render(<ArtistReleaseInfo artistName="Test Artist" title="Test Album" />);

    const article = container.querySelector('article');
    expect(article).toBeInTheDocument();
  });

  it('should render both artist name and title with special characters', () => {
    render(<ArtistReleaseInfo artistName="Beyoncé" title="4 (Deluxe)" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Beyoncé - 4 (Deluxe)');
    expect(screen.getByText('4 (Deluxe)')).toBeInTheDocument();
  });
});
