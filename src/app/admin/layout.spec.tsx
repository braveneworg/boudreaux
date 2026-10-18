/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { gateAction } from '@/lib/auth/action-gate';

import AdminLayout from './layout';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/action-gate');

vi.mock('./components/admin-nav', () => ({
  AdminNav: () => <nav data-testid="admin-nav">AdminNav</nav>,
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({
      success: true,
      session: { user: { id: 'admin-1', role: 'admin' } } as never,
    });
  });

  it('throws the refusal copy to the error boundary when the gate refuses', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce({
      success: false,
      error: 'Account suspended',
      code: 'BANNED',
    });

    await expect(AdminLayout({ children: <div /> })).rejects.toThrow('Account suspended');
  });

  it('applies the kraft zine accent to the content container', async () => {
    const { container } = render(await AdminLayout({ children: <div data-testid="probe" /> }));

    expect(container.querySelector('section.zine-accent-kraft')).toBeInTheDocument();
  });

  it('renders children inside the kraft-accented content container', async () => {
    render(await AdminLayout({ children: <div data-testid="probe" /> }));

    expect(screen.getByTestId('probe').closest('section.zine-accent-kraft')).toBeInTheDocument();
  });
});
