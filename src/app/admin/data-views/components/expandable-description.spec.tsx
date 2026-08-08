// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExpandableDescription } from './expandable-description';

/** Deterministic text of exactly `length` characters. */
const textOfLength = (length: number): string => 'x'.repeat(length);

const LONG_TEXT = `${'A sentence of filler prose. '.repeat(20)}The final sentence.`;

describe('ExpandableDescription', () => {
  it('renders short text plainly with no expand control', () => {
    render(<ExpandableDescription text="A short description." />);

    expect(screen.getByText('A short description.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders text of exactly 500 characters without the expand control', () => {
    render(<ExpandableDescription text={textOfLength(500)} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('collapses text beyond 500 characters behind an expand control', () => {
    render(<ExpandableDescription text={textOfLength(501)} />);

    const button = screen.getByRole('button', { name: 'Show full description' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('clamps the collapsed text and fades it out with a gradient overlay', () => {
    const { container } = render(<ExpandableDescription text={LONG_TEXT} />);

    const paragraph = screen.getByText(/The final sentence\./);
    expect(paragraph.className).toContain('overflow-hidden');
    expect(container.querySelector('[data-slot="description-fade"]')).not.toBeNull();
  });

  it('expands to the full text on click and removes the clamp and fade', async () => {
    const { container } = render(<ExpandableDescription text={LONG_TEXT} />);

    await userEvent.click(screen.getByRole('button', { name: 'Show full description' }));

    const button = screen.getByRole('button', { name: 'Collapse description' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const paragraph = screen.getByText(/The final sentence\./);
    expect(paragraph.className).not.toContain('overflow-hidden');
    expect(container.querySelector('[data-slot="description-fade"]')).toBeNull();
  });

  it('collapses again on a second click', async () => {
    render(<ExpandableDescription text={LONG_TEXT} />);

    await userEvent.click(screen.getByRole('button', { name: 'Show full description' }));
    await userEvent.click(screen.getByRole('button', { name: 'Collapse description' }));

    const button = screen.getByRole('button', { name: 'Show full description' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/The final sentence\./).className).toContain('overflow-hidden');
  });
});
