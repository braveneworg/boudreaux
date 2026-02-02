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

  it('has default height class', () => {
    render(<VerticalSeparator />);

    expect(document.querySelector('[data-slot="separator"]')).toHaveClass('h-10');
  });

  it('applies custom className', () => {
    render(<VerticalSeparator className="custom-separator" />);

    expect(document.querySelector('[data-slot="separator"]')).toHaveClass('custom-separator');
  });

  it('has margin class', () => {
    render(<VerticalSeparator />);

    expect(document.querySelector('[data-slot="separator"]')).toHaveClass('mx-px');
  });
});
