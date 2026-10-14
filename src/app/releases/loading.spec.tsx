/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import ReleasesLoading from './loading';

describe('ReleasesLoading', () => {
  it('wraps the skeleton in the page’s cyan zine panel', () => {
    const { container } = render(<ReleasesLoading />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-cyan');
    expect(panel).toContainElement(screen.getByTestId('releases-grid-skeleton'));
  });

  it('shows the same search, heading and cover grid skeleton as the listing', () => {
    render(<ReleasesLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading releases…');
    expect(screen.getByTestId('releases-search-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('releases-heading-skeleton')).toBeInTheDocument();
    expect(screen.getAllByTestId('releases-card-skeleton').length).toBeGreaterThan(0);
  });
});
