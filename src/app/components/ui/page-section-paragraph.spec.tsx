/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { PageSectionParagraph } from './page-section-paragraph';

describe('PageSectionParagraph', () => {
  it('renders', () => {
    render(<PageSectionParagraph>Test content</PageSectionParagraph>);

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders as a paragraph element', () => {
    render(<PageSectionParagraph>Paragraph text</PageSectionParagraph>);

    const element = screen.getByText('Paragraph text');
    expect(element.tagName).toBe('P');
  });

  it('renders children', () => {
    render(
      <PageSectionParagraph>
        <span data-testid="child">Child span</span>
      </PageSectionParagraph>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies default className when no className prop', () => {
    render(<PageSectionParagraph>Content</PageSectionParagraph>);

    const paragraph = screen.getByText('Content');
    expect(paragraph).toHaveClass(
      'mb-4',
      'text-zinc-700',
      'leading-relaxed',
      'text-lg',
      'mt-0',
      'pt-0'
    );
  });

  it('applies custom className when provided', () => {
    render(<PageSectionParagraph className="custom-class">Content</PageSectionParagraph>);

    const paragraph = screen.getByText('Content');
    expect(paragraph).toHaveClass('custom-class');
  });

  it('custom className replaces default className', () => {
    render(<PageSectionParagraph className="only-this">Content</PageSectionParagraph>);

    const paragraph = screen.getByText('Content');
    expect(paragraph).toHaveClass('only-this');
    expect(paragraph).not.toHaveClass('mb-4');
  });

  it('renders multiple text nodes', () => {
    render(<PageSectionParagraph>First part. Second part.</PageSectionParagraph>);

    expect(screen.getByText('First part. Second part.')).toBeInTheDocument();
  });
});
