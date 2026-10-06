/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { useHydrated } from './use-hydrated';

const Probe = (): React.ReactElement => <span>{useHydrated() ? 'hydrated' : 'server'}</span>;

describe('useHydrated', () => {
  it('is false in the server render, so the markup matches the first client render', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('is true once the component has mounted in the browser', () => {
    render(<Probe />);

    expect(screen.getByText('hydrated')).toBeInTheDocument();
  });
});
