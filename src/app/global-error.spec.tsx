/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { reportClientError } from '@/utils/report-client-error';

import GlobalErrorPage from './global-error';

vi.mock('@/utils/report-client-error', () => ({
  reportClientError: vi.fn(),
}));

vi.mock('./globals.css', () => ({}));

describe('GlobalErrorPage', () => {
  // React warns about rendering <html> inside the test container; the
  // markup is required by the Next.js global-error contract.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports the error with the global boundary on mount', () => {
    const error = Object.assign(new Error('layout crashed'), { digest: 'xyz' });
    render(<GlobalErrorPage error={error} reset={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(error, 'global');
  });

  it('renders a retry button that calls reset', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<GlobalErrorPage error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('applies the storm accent to the body', () => {
    // React 19 treats <body> as a singleton and applies its props to document.body.
    render(<GlobalErrorPage error={new Error('boom')} reset={vi.fn()} />);

    expect(document.body).toHaveClass('zine-accent-storm');
  });

  it('renders the content on a hand-rolled zine panel', () => {
    const { container } = render(<GlobalErrorPage error={new Error('boom')} reset={vi.fn()} />);

    const panel = container.querySelector('main > div');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('bg-menu-item-tan-100', 'border-2', 'border-black', 'shadow-zine');
  });

  it('renders the plain error heading image', () => {
    render(<GlobalErrorPage error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'error' })).toBeInTheDocument();
  });

  it('gives the retry button the punk press treatment', () => {
    render(<GlobalErrorPage error={new Error('boom')} reset={vi.fn()} />);

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toHaveClass('shadow-zine-sm');
    expect(button).not.toHaveClass('rounded-md');
  });
});
