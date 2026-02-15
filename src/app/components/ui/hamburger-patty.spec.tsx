/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import HamburgerPatty from './hamburger-patty';

describe('HamburgerPatty', () => {
  it('renders', () => {
    const { container } = render(<HamburgerPatty />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('renders with default classes', () => {
    const { container } = render(<HamburgerPatty />);

    const span = container.querySelector('span');
    expect(span).toHaveClass('absolute', 'w-5', 'h-0.5', 'bg-white', 'pointer-events-none');
  });

  it('renders with custom width', () => {
    const { container } = render(<HamburgerPatty width="w-8" />);

    const span = container.querySelector('span');
    expect(span).toHaveClass('w-8');
  });

  it('renders with custom height', () => {
    const { container } = render(<HamburgerPatty height="h-1" />);

    const span = container.querySelector('span');
    expect(span).toHaveClass('h-1');
  });

  it('renders with custom bgColor', () => {
    const { container } = render(<HamburgerPatty bgColor="bg-black" />);

    const span = container.querySelector('span');
    expect(span).toHaveClass('bg-black');
  });

  it('renders when open', () => {
    const { container } = render(<HamburgerPatty isOpen />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('renders when closed', () => {
    const { container } = render(<HamburgerPatty isOpen={false} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom rotateOpen value', () => {
    const { container } = render(<HamburgerPatty rotateOpen={90} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom rotateClosed value', () => {
    const { container } = render(<HamburgerPatty rotateClosed={15} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom yOffset', () => {
    const { container } = render(<HamburgerPatty yOffset={-12} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom duration', () => {
    const { container } = render(<HamburgerPatty duration={0.3} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom opacityOpen', () => {
    const { container } = render(<HamburgerPatty opacityOpen={0.5} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('accepts custom opacityClosed', () => {
    const { container } = render(<HamburgerPatty opacityClosed={0.5} />);

    expect(container.querySelector('span')).toBeInTheDocument();
  });
});
