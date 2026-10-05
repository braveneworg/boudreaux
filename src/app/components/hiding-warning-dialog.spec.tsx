/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PublishedWorkCreditedTo } from '@/lib/utils/credit-confirmation';

import { HidingWarningDialog } from './hiding-warning-dialog';

const work: PublishedWorkCreditedTo = {
  releases: [
    { id: 'r1', title: 'Broken Bone Ballads', leavesNoByline: false },
    { id: 'r2', title: 'Sad, Fat Luck', leavesNoByline: false },
  ],
  tourDates: [
    {
      id: 'd1',
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      tourId: 't1',
      tourTitle: 'Fall Tour',
    },
  ],
};

interface Rendered {
  user: ReturnType<typeof userEvent.setup>;
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
}

const renderDialog = (value: PublishedWorkCreditedTo | null = work): Rendered => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<HidingWarningDialog work={value} onConfirm={onConfirm} onCancel={onCancel} />);
  return { user: userEvent.setup({ delay: null }), onConfirm, onCancel };
};

describe('HidingWarningDialog', () => {
  it('stays closed while there is nothing to warn about', () => {
    renderDialog(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the published releases that will lose the name', () => {
    renderDialog();

    expect(screen.getAllByTestId(/^hidden-release-/).map((item) => item.textContent)).toEqual([
      'Broken Bone Ballads',
      'Sad, Fat Luck',
    ]);
  });

  it('lists the tour dates that will lose the name', () => {
    renderDialog();

    expect(screen.getByTestId('hidden-tour-date-d1')).toHaveTextContent('Fall Tour — Nov 1, 2026');
  });

  it('leaves out a section with nothing in it', () => {
    renderDialog({ ...work, tourDates: [] });

    expect(screen.queryByText('Tour dates')).not.toBeInTheDocument();
  });

  it('says the work itself stays public', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'They stay public, without this artist’s name.'
    );
  });

  // The artist is the first credit (album artist) of a release it leads;
  // hiding it leaves that release with no byline (ADR-0015).
  describe('releases the artist leads', () => {
    const leading: PublishedWorkCreditedTo = {
      releases: [
        { id: 'r1', title: 'Broken Bone Ballads', leavesNoByline: true },
        { id: 'r2', title: 'Sad, Fat Luck', leavesNoByline: false },
      ],
      tourDates: [],
    };

    it('lists them apart, as left without a byline', () => {
      renderDialog(leading);

      expect({
        noByline: screen
          .getByRole('region', { name: 'Left without a byline' })
          .querySelectorAll('li').length,
        named: screen.getAllByTestId(/^hidden-release-/).map((item) => item.textContent),
        lost: screen.getAllByTestId(/^byline-lost-release-/).map((item) => item.textContent),
      }).toEqual({ noByline: 1, named: ['Sad, Fat Luck'], lost: ['Broken Bone Ballads'] });
    });

    it('says the dashboard lists them afterwards', () => {
      renderDialog(leading);

      expect(screen.getByRole('region', { name: 'Left without a byline' })).toHaveTextContent(
        'The dashboard lists them until a public artist leads each one.'
      );
    });

    it('leaves the section out when the artist leads none', () => {
      renderDialog();

      expect(screen.queryByRole('region', { name: 'Left without a byline' })).toBeNull();
    });
  });

  it('confirms hiding the artist', async () => {
    const { user, onConfirm } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Hide artist' }));

    expect(onConfirm.mock.calls).toEqual([[]]);
  });

  it('cancels without confirming', async () => {
    const { user, onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect({ confirms: onConfirm.mock.calls, cancels: onCancel.mock.calls }).toEqual({
      confirms: [],
      cancels: [[]],
    });
  });
});
