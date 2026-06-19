/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Disc } from 'lucide-react';

import { SectionHeader } from './section-header';

describe('SectionHeader', () => {
  const defaultProps = {
    icon: Disc,
    title: 'Releases',
    helpText: 'Manage your music releases here.',
  };

  it('renders the title', () => {
    render(<SectionHeader {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Releases' })).toBeInTheDocument();
  });

  it('renders a heading at the requested level', () => {
    render(<SectionHeader {...defaultProps} level={2} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Releases' })).toBeInTheDocument();
  });

  it('defaults to a level-1 heading', () => {
    render(<SectionHeader {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Releases' })).toBeInTheDocument();
  });

  it('exposes an accessible help trigger', () => {
    render(<SectionHeader {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'About Releases' })).toBeInTheDocument();
  });

  it('does not show help text until the trigger is activated', () => {
    render(<SectionHeader {...defaultProps} />);

    expect(screen.queryByText('Manage your music releases here.')).not.toBeInTheDocument();
  });

  it('reveals help text when the trigger is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<SectionHeader {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'About Releases' }));

    expect(screen.getByText('Manage your music releases here.')).toBeInTheDocument();
  });

  it('applies a custom className to the wrapper', () => {
    const { container } = render(<SectionHeader {...defaultProps} className="custom-header" />);

    expect(container.firstChild).toHaveClass('custom-header');
  });
});
