/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ContentContainer } from './content-container';

describe('ContentContainer', () => {
  it('renders', () => {
    render(
      <ContentContainer>
        <div>Content</div>
      </ContentContainer>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders as section element', () => {
    render(
      <ContentContainer>
        <div>Content</div>
      </ContentContainer>
    );

    const section = document.querySelector('section');
    expect(section).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ContentContainer>
        <div data-testid="child">Child content</div>
      </ContentContainer>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ContentContainer className="custom-container">
        <div>Content</div>
      </ContentContainer>
    );

    const section = document.querySelector('section');
    expect(section).toHaveClass('custom-container');
  });

  it('has default background class', () => {
    render(
      <ContentContainer>
        <div>Content</div>
      </ContentContainer>
    );

    const section = document.querySelector('section');
    expect(section).toHaveClass('bg-zinc-100');
  });

  it('has flex layout classes', () => {
    render(
      <ContentContainer>
        <div>Content</div>
      </ContentContainer>
    );

    const section = document.querySelector('section');
    expect(section).toHaveClass('flex-1', 'flex', 'flex-col');
  });

  it('renders multiple children', () => {
    render(
      <ContentContainer>
        <div data-testid="child1">First</div>
        <div data-testid="child2">Second</div>
        <div data-testid="child3">Third</div>
      </ContentContainer>
    );

    expect(screen.getByTestId('child1')).toBeInTheDocument();
    expect(screen.getByTestId('child2')).toBeInTheDocument();
    expect(screen.getByTestId('child3')).toBeInTheDocument();
  });
});
