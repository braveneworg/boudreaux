/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { AllReleasesLink } from './all-releases-link';

describe('AllReleasesLink', () => {
  it('links to the releases listing filtered by the artist', () => {
    render(<AllReleasesLink slug="marguerite-ash" />);

    expect(screen.getByRole('link', { name: 'View all releases' })).toHaveAttribute(
      'href',
      '/releases?artist=marguerite-ash'
    );
  });

  it('puts a decorative eye icon ahead of the words', () => {
    render(<AllReleasesLink slug="marguerite-ash" />);

    const icon = screen.getByRole('link').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.nextSibling).toHaveTextContent('View all releases');
  });
});
