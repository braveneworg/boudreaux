/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import CookiesPolicyPage from './page';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('CookiesPolicyPage', () => {
  it('renders the content on a kraft zine panel', () => {
    const { container } = render(<CookiesPolicyPage />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('renders the Legal crumb as plain text, not a link', () => {
    render(<CookiesPolicyPage />);

    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Legal' })).not.toBeInTheDocument();
  });

  it('renders the main heading', () => {
    render(<CookiesPolicyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Cookie Policy' })).toBeInTheDocument();
  });
});
