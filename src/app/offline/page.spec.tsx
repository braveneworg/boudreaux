/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import OfflinePage from './page';

describe('OfflinePage', () => {
  it('tells the visitor they are offline', () => {
    render(<OfflinePage />);

    expect(screen.getByRole('heading', { name: /you're offline/i })).toBeInTheDocument();
  });

  it('reassures that already-visited pages still load', () => {
    render(<OfflinePage />);

    expect(screen.getByText(/already visited will still load/i)).toBeInTheDocument();
  });

  it('carries the kraft zine accent on the page container', () => {
    const { container } = render(<OfflinePage />);

    expect(container.firstChild).toHaveClass('zine-accent-kraft');
  });
});
