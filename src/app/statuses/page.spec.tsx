/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import Statuses from './page';

vi.mock('@/components/cdn-status-banner', () => ({
  CDNStatusBanner: () => <div data-testid="cdn-status-banner" />,
}));

vi.mock('@/components/data-store-health-status', () => ({
  DataStoreHealthStatus: () => <div data-testid="data-store-health-status" />,
}));

describe('Statuses', () => {
  it('renders both status components', () => {
    render(<Statuses />);

    expect(screen.getByTestId('data-store-health-status')).toBeInTheDocument();
    expect(screen.getByTestId('cdn-status-banner')).toBeInTheDocument();
  });

  it('wraps the status components in a kraft-accent container', () => {
    const { container } = render(<Statuses />);

    const wrapper = container.querySelector('.zine-accent-kraft');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toContainElement(screen.getByTestId('data-store-health-status'));
    expect(wrapper).toContainElement(screen.getByTestId('cdn-status-banner'));
  });
});
