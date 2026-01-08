import { render, screen } from '@testing-library/react';

import Home from './page';

// Mock UI components
vi.mock('./components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('./components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

describe('Home Page', () => {
  it('should render page structure', () => {
    render(<Home />);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render featured artists heading', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'Featured artists' })).toBeInTheDocument();
  });

  it('should have proper heading hierarchy', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', { name: 'Featured artists' });
    expect(heading.tagName).toBe('H1');
    expect(heading).toHaveClass('pt-4', 'px-4', 'h-13', 'mb-0', 'leading-tight');
  });
});
