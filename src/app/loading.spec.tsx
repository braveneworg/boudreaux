/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';

import HomeLoading from './loading';

describe('HomeLoading', () => {
  it('renders the LCP banner with high fetch priority', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');

    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('uses a single fixed-width src that matches the HTTP Link preload', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');
    const expectedFilenameFragment = encodeURIComponent(BANNER_SLOTS[0].filename).replace(
      /\.webp$/,
      ''
    );

    expect(img.getAttribute('src')).toContain(expectedFilenameFragment);
    expect(img.getAttribute('src')).toContain('_w750.webp');
    // Intentionally no srcset/sizes — see comment in `loading.tsx` and
    // `next.config.ts` for why a responsive preload caused Chrome's preload
    // picker to mismatch the unmounted Suspense fallback <img>.
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('sizes')).toBeNull();
  });

  it('reserves banner space using the shared aspect-ratio constant', () => {
    render(<HomeLoading />);
    const wrapper = screen.getByTestId('lcp-banner-img').parentElement;

    expect(wrapper).toHaveStyle({ paddingBottom: BANNER_ASPECT_PADDING });
  });
});
