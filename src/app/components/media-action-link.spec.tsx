/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';

import { MediaActionLink } from './media-action-link';

describe('MediaActionLink', () => {
  it('renders icon and label', () => {
    render(<MediaActionLink icon={Play} label="Play track" />);

    expect(screen.getByRole('button', { name: /play track/i })).toBeInTheDocument();
    expect(screen.getByRole('button')).toContainElement(screen.getByText('Play track'));
  });

  it('applies className and forwards button props', () => {
    const onClick = vi.fn();

    render(
      <MediaActionLink
        icon={Play}
        label="Open media"
        className="custom-action-link"
        aria-pressed={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: /open media/i });
    expect(button).toHaveClass('custom-action-link');

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
