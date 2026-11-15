/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import CommunityLayout from './layout';

vi.mock('@/app/components/community/submission-modal-provider', () => ({
  SubmissionModalProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="submission-modal-provider">{children}</div>
  ),
}));

describe('CommunityLayout', () => {
  it('hosts the submission modal over every community page', () => {
    render(
      <CommunityLayout>
        <p>A community page</p>
      </CommunityLayout>
    );

    expect(
      within(screen.getByTestId('submission-modal-provider')).getByText('A community page')
    ).toBeInTheDocument();
  });
});
