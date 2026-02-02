import { render, screen } from '@testing-library/react';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb';

describe('Breadcrumb Components', () => {
  describe('Breadcrumb', () => {
    it('renders with aria-label', () => {
      render(<Breadcrumb data-testid="breadcrumb" />);

      const nav = screen.getByTestId('breadcrumb');
      expect(nav).toHaveAttribute('aria-label', 'breadcrumb');
    });

    it('renders with data-slot attribute', () => {
      render(<Breadcrumb data-testid="breadcrumb" />);

      expect(screen.getByTestId('breadcrumb')).toHaveAttribute('data-slot', 'breadcrumb');
    });

    it('forwards additional props', () => {
      render(<Breadcrumb data-testid="breadcrumb" id="main-breadcrumb" />);

      expect(screen.getByTestId('breadcrumb')).toHaveAttribute('id', 'main-breadcrumb');
    });
  });

  describe('BreadcrumbList', () => {
    it('renders as an ordered list', () => {
      render(<BreadcrumbList data-testid="list" />);

      const list = screen.getByTestId('list');
      expect(list.tagName).toBe('OL');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbList data-testid="list" />);

      expect(screen.getByTestId('list')).toHaveAttribute('data-slot', 'breadcrumb-list');
    });

    it('applies custom className', () => {
      render(<BreadcrumbList data-testid="list" className="custom-class" />);

      expect(screen.getByTestId('list')).toHaveClass('custom-class');
    });

    it('renders children', () => {
      render(
        <BreadcrumbList>
          <BreadcrumbItem>Home</BreadcrumbItem>
        </BreadcrumbList>
      );

      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });

  describe('BreadcrumbItem', () => {
    it('renders as a list item', () => {
      render(<BreadcrumbItem data-testid="item" />);

      const item = screen.getByTestId('item');
      expect(item.tagName).toBe('LI');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbItem data-testid="item" />);

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'breadcrumb-item');
    });

    it('applies custom className', () => {
      render(<BreadcrumbItem data-testid="item" className="custom-class" />);

      expect(screen.getByTestId('item')).toHaveClass('custom-class');
    });

    it('renders children', () => {
      render(<BreadcrumbItem>Products</BreadcrumbItem>);

      expect(screen.getByText('Products')).toBeInTheDocument();
    });
  });

  describe('BreadcrumbLink', () => {
    it('renders as an anchor by default', () => {
      render(<BreadcrumbLink href="/home">Home</BreadcrumbLink>);

      const link = screen.getByText('Home');
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/home');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbLink href="/home">Home</BreadcrumbLink>);

      expect(screen.getByText('Home')).toHaveAttribute('data-slot', 'breadcrumb-link');
    });

    it('applies custom className', () => {
      render(
        <BreadcrumbLink href="/home" className="custom-class">
          Home
        </BreadcrumbLink>
      );

      expect(screen.getByText('Home')).toHaveClass('custom-class');
    });

    it('renders as Slot when asChild is true', () => {
      render(
        <BreadcrumbLink asChild>
          <span data-testid="child">Custom Child</span>
        </BreadcrumbLink>
      );

      const child = screen.getByTestId('child');
      expect(child).toHaveAttribute('data-slot', 'breadcrumb-link');
    });
  });

  describe('BreadcrumbPage', () => {
    it('renders as a span', () => {
      render(<BreadcrumbPage>Current Page</BreadcrumbPage>);

      const page = screen.getByText('Current Page');
      expect(page.tagName).toBe('SPAN');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbPage>Current Page</BreadcrumbPage>);

      expect(screen.getByText('Current Page')).toHaveAttribute('data-slot', 'breadcrumb-page');
    });

    it('has aria-current="page"', () => {
      render(<BreadcrumbPage>Current Page</BreadcrumbPage>);

      expect(screen.getByText('Current Page')).toHaveAttribute('aria-current', 'page');
    });

    it('has aria-disabled="true"', () => {
      render(<BreadcrumbPage>Current Page</BreadcrumbPage>);

      expect(screen.getByText('Current Page')).toHaveAttribute('aria-disabled', 'true');
    });

    it('has role="link"', () => {
      render(<BreadcrumbPage>Current Page</BreadcrumbPage>);

      expect(screen.getByRole('link')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<BreadcrumbPage className="custom-class">Current Page</BreadcrumbPage>);

      expect(screen.getByText('Current Page')).toHaveClass('custom-class');
    });
  });

  describe('BreadcrumbSeparator', () => {
    it('renders as a list item', () => {
      render(<BreadcrumbSeparator data-testid="separator" />);

      const separator = screen.getByTestId('separator');
      expect(separator.tagName).toBe('LI');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbSeparator data-testid="separator" />);

      expect(screen.getByTestId('separator')).toHaveAttribute('data-slot', 'breadcrumb-separator');
    });

    it('has role="presentation"', () => {
      render(<BreadcrumbSeparator data-testid="separator" />);

      expect(screen.getByTestId('separator')).toHaveAttribute('role', 'presentation');
    });

    it('has aria-hidden="true"', () => {
      render(<BreadcrumbSeparator data-testid="separator" />);

      expect(screen.getByTestId('separator')).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders ChevronRight icon by default', () => {
      render(<BreadcrumbSeparator data-testid="separator" />);

      // The separator should contain an SVG (ChevronRight icon)
      const separator = screen.getByTestId('separator');
      expect(separator.querySelector('svg')).toBeInTheDocument();
    });

    it('renders custom children when provided', () => {
      render(<BreadcrumbSeparator>/</BreadcrumbSeparator>);

      expect(screen.getByText('/')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<BreadcrumbSeparator data-testid="separator" className="custom-class" />);

      expect(screen.getByTestId('separator')).toHaveClass('custom-class');
    });
  });

  describe('BreadcrumbEllipsis', () => {
    it('renders as a span', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      const ellipsis = screen.getByTestId('ellipsis');
      expect(ellipsis.tagName).toBe('SPAN');
    });

    it('renders with data-slot attribute', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      expect(screen.getByTestId('ellipsis')).toHaveAttribute('data-slot', 'breadcrumb-ellipsis');
    });

    it('has role="presentation"', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      expect(screen.getByTestId('ellipsis')).toHaveAttribute('role', 'presentation');
    });

    it('has aria-hidden="true"', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      expect(screen.getByTestId('ellipsis')).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders MoreHorizontal icon', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" />);

      const ellipsis = screen.getByTestId('ellipsis');
      expect(ellipsis.querySelector('svg')).toBeInTheDocument();
    });

    it('has screen reader text', () => {
      render(<BreadcrumbEllipsis />);

      expect(screen.getByText('More')).toBeInTheDocument();
      expect(screen.getByText('More')).toHaveClass('sr-only');
    });

    it('applies custom className', () => {
      render(<BreadcrumbEllipsis data-testid="ellipsis" className="custom-class" />);

      expect(screen.getByTestId('ellipsis')).toHaveClass('custom-class');
    });
  });

  describe('integration', () => {
    it('renders a complete breadcrumb structure', () => {
      render(
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/products">Products</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Category</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );

      expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('href', '/products');
      expect(screen.getByText('Category')).toHaveAttribute('aria-current', 'page');
    });

    it('renders breadcrumb with ellipsis for truncated paths', () => {
      render(
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Current</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      );

      expect(screen.getByText('More')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });
});
