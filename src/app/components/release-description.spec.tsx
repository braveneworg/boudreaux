/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ReleaseDescription } from '@/app/components/release-description';

describe('ReleaseDescription', () => {
  it('should render description text', () => {
    render(<ReleaseDescription description="A great album about life." />);

    expect(screen.getByText('A great album about life.')).toBeInTheDocument();
  });

  it('should apply whitespace-pre-line for line break support', () => {
    render(<ReleaseDescription description="Line one.\nLine two." />);

    const element = screen.getByTestId('release-description');
    expect(element).toHaveClass('whitespace-pre-line');
  });

  it('should preserve newlines as visible line breaks', () => {
    render(<ReleaseDescription description={'First paragraph\n\nSecond paragraph'} />);

    const element = screen.getByTestId('release-description');
    expect(element.textContent).toContain('First paragraph');
    expect(element.textContent).toContain('Second paragraph');
  });

  it('should return null when description is null', () => {
    const { container } = render(<ReleaseDescription description={null} />);

    expect(container.innerHTML).toBe('');
  });

  it('should return null when description is empty string', () => {
    const { container } = render(<ReleaseDescription description="" />);

    expect(container.innerHTML).toBe('');
  });

  it('should apply break-words class for overflow protection', () => {
    const longText = 'A'.repeat(500);
    render(<ReleaseDescription description={longText} />);

    const element = screen.getByTestId('release-description');
    expect(element).toHaveClass('break-words');
  });

  it('should handle long unbroken strings gracefully', () => {
    const longUnbroken = 'superlongstringwithnobreaks'.repeat(50);
    render(<ReleaseDescription description={longUnbroken} />);

    const element = screen.getByTestId('release-description');
    expect(element).toHaveClass('break-words');
    expect(element.textContent).toContain(longUnbroken);
  });
});
