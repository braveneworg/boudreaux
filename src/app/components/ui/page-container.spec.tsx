import { render, screen } from '@testing-library/react';

import PageContainer from './page-container';

describe('PageContainer', () => {
  it('renders', () => {
    render(
      <PageContainer>
        <div>Content</div>
      </PageContainer>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <PageContainer>
        <div data-testid="child">Child content</div>
      </PageContainer>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <PageContainer className="custom-container">
        <div>Content</div>
      </PageContainer>
    );

    const container = screen.getByText('Content').parentElement;
    expect(container).toHaveClass('custom-container');
  });

  it('has flex layout classes', () => {
    render(
      <PageContainer>
        <div data-testid="child">Content</div>
      </PageContainer>
    );

    const container = screen.getByTestId('child').parentElement;
    expect(container).toHaveClass('flex-1', 'flex', 'flex-col');
  });

  it('has min-h-full class', () => {
    render(
      <PageContainer>
        <div data-testid="child">Content</div>
      </PageContainer>
    );

    const container = screen.getByTestId('child').parentElement;
    expect(container).toHaveClass('min-h-full');
  });

  it('renders multiple children', () => {
    render(
      <PageContainer>
        <div data-testid="child1">First</div>
        <div data-testid="child2">Second</div>
      </PageContainer>
    );

    expect(screen.getByTestId('child1')).toBeInTheDocument();
    expect(screen.getByTestId('child2')).toBeInTheDocument();
  });
});
