/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { NowPlayingHeading } from './now-playing-heading';

describe('NowPlayingHeading', () => {
  const defaultProps = {
    artistName: 'Test Artist',
    title: 'Test Song',
  };

  it('renders artist name and title', () => {
    render(<NowPlayingHeading {...defaultProps} />);

    expect(screen.getByText(/Test Artist/)).toBeInTheDocument();
    expect(screen.getByText('Test Song')).toBeInTheDocument();
  });

  it('sets the correct aria-label on the heading', () => {
    render(<NowPlayingHeading {...defaultProps} />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveAttribute('aria-label', 'Now playing: Test Artist - Test Song');
  });

  it('applies sr-only class by default when visibleHeading is not set', () => {
    render(<NowPlayingHeading {...defaultProps} />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveClass('sr-only');
  });

  it('does not apply sr-only class when visibleHeading is true', () => {
    render(<NowPlayingHeading {...defaultProps} visibleHeading />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).not.toHaveClass('sr-only');
    expect(heading).toHaveClass('font-bold');
  });

  it('applies sr-only class when visibleHeading is explicitly false', () => {
    render(<NowPlayingHeading {...defaultProps} visibleHeading={false} />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveClass('sr-only');
  });

  it('renders inside a section element', () => {
    const { container } = render(<NowPlayingHeading {...defaultProps} />);

    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('renders the title in an italic span', () => {
    render(<NowPlayingHeading {...defaultProps} />);

    const titleSpan = screen.getByText('Test Song');
    expect(titleSpan.tagName).toBe('SPAN');
    expect(titleSpan).toHaveClass('italic');
  });
});
