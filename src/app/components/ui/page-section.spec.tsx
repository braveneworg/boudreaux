import { render, screen } from '@testing-library/react';

import { PageSection } from './page-section';

describe('PageSection', () => {
  it('renders', () => {
    render(
      <PageSection id="test-section" title="Test Section">
        <div>Content</div>
      </PageSection>
    );

    // Section element without aria-labelledby doesn't have region role by default
    expect(document.querySelector('section')).toBeInTheDocument();
  });

  it('renders with id attribute', () => {
    render(
      <PageSection id="my-section" title="My Section">
        <div>Content</div>
      </PageSection>
    );

    expect(document.getElementById('my-section')).toBeInTheDocument();
  });

  it('renders title as h2', () => {
    render(
      <PageSection id="section" title="Section Title">
        <div>Content</div>
      </PageSection>
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section Title');
  });

  it('renders children', () => {
    render(
      <PageSection id="section" title="Title">
        <div data-testid="child">Child content</div>
      </PageSection>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <PageSection id="section" title="Title" className="custom-section">
        <div>Content</div>
      </PageSection>
    );

    expect(document.getElementById('section')).toHaveClass('custom-section');
  });

  it('has default margin-top class', () => {
    render(
      <PageSection id="section" title="Title">
        <div>Content</div>
      </PageSection>
    );

    expect(document.getElementById('section')).toHaveClass('mt-[4rem]');
  });

  it('renders multiple children', () => {
    render(
      <PageSection id="section" title="Title">
        <p data-testid="para1">Paragraph 1</p>
        <p data-testid="para2">Paragraph 2</p>
      </PageSection>
    );

    expect(screen.getByTestId('para1')).toBeInTheDocument();
    expect(screen.getByTestId('para2')).toBeInTheDocument();
  });
});
