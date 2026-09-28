/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CreditConfirmation } from '@/lib/utils/credit-confirmation';

import { CreditConfirmationDialog } from './credit-confirmation-dialog';

const abel = {
  id: 'a',
  slug: 'abel',
  name: 'Abel',
  bioState: 'generated' as const,
  bioGeneratedAt: new Date('2026-09-01T00:00:00.000Z'),
  displayImageCount: 2,
};
const bea = {
  id: 'b',
  slug: 'bea',
  name: 'Bea',
  bioState: 'none' as const,
  bioGeneratedAt: null,
  displayImageCount: 0,
};
const gone = { id: 'x', slug: 'gone', name: 'Gone', reason: 'deleted' as const };

const confirmation: CreditConfirmation = { awaiting: [abel, bea], stayHidden: [gone] };

interface Rendered {
  user: ReturnType<typeof userEvent.setup>;
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
}

const renderDialog = (value: CreditConfirmation | null = confirmation): Rendered => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <CreditConfirmationDialog
      confirmation={value}
      confirmLabel="Publish release"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { user: userEvent.setup({ delay: null }), onConfirm, onCancel };
};

describe('CreditConfirmationDialog', () => {
  it('stays closed while there is nothing to confirm', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists each artist awaiting a decision', () => {
    renderDialog();

    expect(
      screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-label'))
    ).toEqual(['Publish Abel', 'Publish Bea']);
  });

  it('keeps every artist hidden until the admin chooses otherwise', () => {
    renderDialog();

    expect(
      screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-checked'))
    ).toEqual(['false', 'false']);
  });

  it('shows a generated bio with its date', () => {
    renderDialog();

    expect(screen.getByTestId('credit-a')).toHaveTextContent('Generated bio (Sep 1, 2026)');
  });

  it('shows that an artist has no bio', () => {
    renderDialog();

    expect(screen.getByTestId('credit-b')).toHaveTextContent('No bio');
  });

  it('shows how many display images go live', () => {
    renderDialog();

    expect(screen.getByTestId('credit-a')).toHaveTextContent('2 display images');
  });

  it('links each artist to its admin page in a new tab', () => {
    renderDialog();

    const link = within(screen.getByTestId('credit-a')).getByRole('link', {
      name: 'Review Abel',
    });

    expect({ href: link.getAttribute('href'), target: link.getAttribute('target') }).toEqual({
      href: '/admin/artists/a',
      target: '_blank',
    });
  });

  it('lists the credits that will not be shown, with the reason', () => {
    renderDialog();

    expect(screen.getByTestId('hidden-x')).toHaveTextContent('Gone — deleted');
  });

  it('explains an artist that is off the roster', () => {
    renderDialog({
      awaiting: [],
      stayHidden: [{ ...gone, reason: 'no-departure-date' }],
    });

    expect(screen.getByTestId('hidden-x')).toHaveTextContent(
      'Gone — inactive with no departure date'
    );
  });

  it('confirms with every artist kept hidden when no toggle is flipped', async () => {
    const { user, onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Publish release' }));

    expect(onConfirm.mock.calls).toEqual([
      [{ publishArtistIds: [], keepHiddenArtistIds: ['a', 'b'] }],
    ]);
  });

  it('confirms with the artists the admin chose to publish', async () => {
    const { user, onConfirm } = renderDialog();

    await user.click(screen.getByRole('switch', { name: 'Publish Bea' }));
    await user.click(screen.getByRole('button', { name: 'Publish release' }));

    expect(onConfirm.mock.calls).toEqual([
      [{ publishArtistIds: ['b'], keepHiddenArtistIds: ['a'] }],
    ]);
  });

  it('lets the admin change their mind', async () => {
    const { user, onConfirm } = renderDialog();

    await user.click(screen.getByRole('switch', { name: 'Publish Bea' }));
    await user.click(screen.getByRole('switch', { name: 'Publish Bea' }));
    await user.click(screen.getByRole('button', { name: 'Publish release' }));

    expect(onConfirm.mock.calls).toEqual([
      [{ publishArtistIds: [], keepHiddenArtistIds: ['a', 'b'] }],
    ]);
  });

  it('cancels without confirming', async () => {
    const { user, onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect({ confirms: onConfirm.mock.calls, cancels: onCancel.mock.calls.length }).toEqual({
      confirms: [],
      cancels: 1,
    });
  });

  it('starts from hidden again for the next release', async () => {
    const onConfirm = vi.fn();
    const props = { confirmLabel: 'Publish release', onConfirm, onCancel: vi.fn() };
    const user = userEvent.setup({ delay: null });
    const { rerender } = render(
      <CreditConfirmationDialog confirmation={confirmation} {...props} />
    );
    await user.click(screen.getByRole('switch', { name: 'Publish Bea' }));

    rerender(<CreditConfirmationDialog confirmation={null} {...props} />);
    rerender(<CreditConfirmationDialog confirmation={{ ...confirmation }} {...props} />);

    expect(screen.getByRole('switch', { name: 'Publish Bea' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});
