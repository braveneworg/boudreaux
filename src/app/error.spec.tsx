/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { reportClientError } from '@/utils/report-client-error';

import ErrorPage from './error';

vi.mock('@/utils/report-client-error', () => ({
  reportClientError: vi.fn(),
}));

describe('ErrorPage', () => {
  it('reports the error with the route boundary on mount', () => {
    const error = Object.assign(new Error('render failed'), { digest: 'abc' });
    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(error, 'route');
  });

  it('renders a retry button that calls reset', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
