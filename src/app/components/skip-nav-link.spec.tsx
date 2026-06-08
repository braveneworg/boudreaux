/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { MAIN_CONTENT_ID, SkipNavLink } from './skip-nav-link';

describe('SkipNavLink', () => {
  it('links to the main content landmark', () => {
    render(<SkipNavLink />);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      `#${MAIN_CONTENT_ID}`
    );
  });

  it('stays visually hidden until it receives focus', () => {
    render(<SkipNavLink />);

    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveClass('sr-only');
    expect(link).toHaveClass('focus:not-sr-only');
  });
});
