/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ZineContentRule } from './zine-content-rule';

describe('ZineContentRule', () => {
  it('renders its children', () => {
    render(<ZineContentRule>framed content</ZineContentRule>);

    expect(screen.getByText('framed content')).toBeInTheDocument();
  });

  it('draws the black rule on the left and bottom edges only', () => {
    render(<ZineContentRule data-testid="rule">content</ZineContentRule>);

    const rule = screen.getByTestId('rule');
    expect(rule).toHaveClass('border-b-2', 'border-l-2', 'border-black');
    expect(rule.className).not.toMatch(/border-t-|border-r-/);
  });

  it('pads inside the rule and margins it off the surrounding frame', () => {
    render(<ZineContentRule data-testid="rule">content</ZineContentRule>);

    expect(screen.getByTestId('rule')).toHaveClass('p-4', 'm-2');
  });

  it('merges a custom className with the rule classes', () => {
    render(
      <ZineContentRule data-testid="rule" className="custom-class">
        content
      </ZineContentRule>
    );

    expect(screen.getByTestId('rule')).toHaveClass('custom-class', 'border-black');
  });
});
