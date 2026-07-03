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

  it('renders the content on a storm zine panel', () => {
    const { container } = render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-storm');
  });

  it('renders the error heading image', () => {
    render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'error' })).toBeInTheDocument();
  });

  it('renders the error image heading as the only level-1 heading', () => {
    render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);

    const topLevelHeadings = screen.getAllByRole('heading', { level: 1 });
    expect(topLevelHeadings).toHaveLength(1);
    expect(topLevelHeadings[0]).toHaveAccessibleName('error');
  });

  it('demotes the text heading below the image heading to level 2', () => {
    render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 2, name: /something went wrong/i })
    ).toBeInTheDocument();
  });
});
