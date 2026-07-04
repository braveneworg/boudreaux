/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { HeaderContainer } from './header-container';

describe('HeaderContainer', () => {
  it('renders its children', () => {
    render(
      <HeaderContainer>
        <div data-testid="child">Child</div>
      </HeaderContainer>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies sticky positioning', () => {
    const { container } = render(<HeaderContainer>content</HeaderContainer>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('sticky', 'top-0', 'z-40');
  });

  it('spans the full width and clips overflow', () => {
    const { container } = render(<HeaderContainer>content</HeaderContainer>);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('w-full', 'left-0', 'right-0', 'overflow-hidden');
  });

  it('drops the glow shadow and clipping at xl', () => {
    const { container } = render(<HeaderContainer>child</HeaderContainer>);
    const el = container.firstElementChild;
    expect(el?.className).toContain('xl:shadow-none');
    expect(el?.className).toContain('xl:overflow-visible');
  });

  it('merges the className passed in', () => {
    const { container } = render(
      <HeaderContainer className="custom-class">content</HeaderContainer>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });
});
