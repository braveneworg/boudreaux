/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlaySharpIcon } from './play-sharp-icon';

describe('PlaySharpIcon', () => {
  it('renders a filled triangle with pointed corners and no stroke', () => {
    const { container } = render(<PlaySharpIcon />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('stroke', 'none');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('polygon')).toHaveAttribute('points', '6 3 20 12 6 21');
    expect(svg?.querySelector('path')).toBeNull();
  });

  it('forwards className and sizes from the size prop by default', () => {
    const { container } = render(<PlaySharpIcon className="size-5" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('size-5');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });
});
