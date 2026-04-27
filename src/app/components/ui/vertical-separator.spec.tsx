/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import VerticalSeparator from './vertical-separator';

describe('VerticalSeparator', () => {
  it('renders', () => {
    render(<VerticalSeparator />);

    expect(document.querySelector('[data-slot="separator"]')).toBeInTheDocument();
  });

  it('has vertical orientation', () => {
    render(<VerticalSeparator />);

    expect(document.querySelector('[data-slot="separator"]')).toHaveAttribute(
      'data-orientation',
      'vertical'
    );
  });

  it('passes className to separator', () => {
    render(<VerticalSeparator className="mx-px h-10" />);

    const separator = document.querySelector('[data-slot="separator"]');
    expect(separator).toHaveClass('h-10');
    expect(separator).toHaveClass('mx-px');
  });

  it('applies custom className', () => {
    render(<VerticalSeparator className="custom-separator" />);

    expect(document.querySelector('[data-slot="separator"]')).toHaveClass('custom-separator');
  });

  it('has vertical width from separator base styles', () => {
    render(<VerticalSeparator />);

    const separator = document.querySelector('[data-slot="separator"]');
    expect(separator).toHaveClass('bg-border');
    expect(separator).toHaveClass('shrink-0');
  });
});
