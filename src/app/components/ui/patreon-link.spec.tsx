/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { PatreonLink } from './patreon-link';

describe('PatreonLink', () => {
  it('renders', () => {
    render(<PatreonLink />);

    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('has correct href', () => {
    render(<PatreonLink />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://www.patreon.com/c/Ceschi/posts'
    );
  });

  it('displays Patreon text', () => {
    render(<PatreonLink />);

    expect(screen.getByText('Patreon')).toBeInTheDocument();
  });

  it('opens in new tab', () => {
    render(<PatreonLink />);

    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('has noopener noreferrer for security', () => {
    render(<PatreonLink />);

    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('has styling classes', () => {
    render(<PatreonLink />);

    expect(screen.getByRole('link')).toHaveClass('text-sm', 'font-medium', 'text-accent');
  });
});
