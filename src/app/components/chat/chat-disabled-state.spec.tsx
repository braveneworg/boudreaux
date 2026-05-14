// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ChatDisabledState } from './chat-disabled-state';

describe('ChatDisabledState', () => {
  it('renders the abuse-report explanation copy', () => {
    render(<ChatDisabledState />);
    expect(screen.getByText(/reported for abuse/i)).toBeInTheDocument();
  });

  it('links to the contact page for support', () => {
    render(<ChatDisabledState />);
    const link = screen.getByRole('link', { name: /contact support/i });
    expect(link).toHaveAttribute('href', '/contact');
  });

  it('renders no input or message-list controls (the drawer is fully gated)', () => {
    render(<ChatDisabledState />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
