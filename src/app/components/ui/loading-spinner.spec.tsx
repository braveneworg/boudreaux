import { render, screen } from '@testing-library/react';

import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('renders', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders spinner element', () => {
    render(<LoadingSpinner />);

    // SpinnerRingCircle renders a div with animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders loading text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-spinner" />);

    const container = screen.getByText('Loading...').parentElement;
    expect(container).toHaveClass('custom-spinner');
  });

  it('has flex layout classes', () => {
    render(<LoadingSpinner />);

    const container = screen.getByText('Loading...').parentElement;
    expect(container).toHaveClass('flex', 'items-center', 'justify-center');
  });

  it('has gap class for spacing', () => {
    render(<LoadingSpinner />);

    const container = screen.getByText('Loading...').parentElement;
    expect(container).toHaveClass('gap-2');
  });

  it('loading text has muted foreground style', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toHaveClass('text-muted-foreground');
  });

  it('loading text has small text size', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('Loading...')).toHaveClass('text-sm');
  });
});
