// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ChatBodyLoading } from './chat-body-loading';

describe('ChatBodyLoading', () => {
  it('names the spinner after what is still loading', () => {
    render(<ChatBodyLoading label="Loading chat" />);

    expect(screen.getByLabelText('Loading chat')).toBeInTheDocument();
  });

  it('fills the drawer body so the real content lands without a re-measure', () => {
    const { container } = render(<ChatBodyLoading label="Loading messages" />);

    expect(container.firstElementChild).toHaveClass('flex-1');
  });
});
