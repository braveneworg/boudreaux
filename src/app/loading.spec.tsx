/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import RootLoading from './loading';

describe('RootLoading', () => {
  it('does not render the home LCP banner image', () => {
    render(<RootLoading />);

    expect(screen.queryByTestId('lcp-banner-img')).not.toBeInTheDocument();
  });

  it('renders no images at all', () => {
    const { container } = render(<RootLoading />);

    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('renders a neutral pulse skeleton', () => {
    const { container } = render(<RootLoading />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
