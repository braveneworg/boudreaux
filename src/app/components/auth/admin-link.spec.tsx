import { render, screen } from '@testing-library/react';

import AdminLink from './admin-link';

describe('AdminLink', () => {
  describe('rendering', () => {
    it('should render admin link with correct text', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toBeInTheDocument();
    });

    it('should render with shield icon', () => {
      const { container } = render(<AdminLink />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should have correct href attribute', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveAttribute('href', '/admin');
    });
  });

  describe('styling', () => {
    it('should have flex layout with items-center', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveClass('flex', 'items-center');
    });

    it('should have gap-2 between icon and text', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveClass('gap-2');
    });

    it('should have text-sm class', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveClass('text-sm');
    });

    it('should have underline-offset-4 class', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveClass('underline-offset-4');
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).toHaveAttribute('href');
    });

    it('should have accessible link text', () => {
      render(<AdminLink />);

      const linkText = screen.getByText('Admin');
      expect(linkText).toBeInTheDocument();
    });

    it('should render icon with correct dimensions', () => {
      const { container } = render(<AdminLink />);

      const icon = container.querySelector('svg');
      expect(icon).toHaveClass('h-4', 'w-4');
    });
  });

  describe('Next.js Link integration', () => {
    it('should use Next.js Link component for client-side navigation', () => {
      const { container } = render(<AdminLink />);

      const link = container.querySelector('a[href="/admin"]');
      expect(link).toBeInTheDocument();
    });

    it('should not have target="_blank" (internal navigation)', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      expect(link).not.toHaveAttribute('target', '_blank');
    });
  });

  describe('icon rendering', () => {
    it('should render ShieldUser icon from lucide-react', () => {
      const { container } = render(<AdminLink />);

      // Icon should be an SVG element
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg?.tagName.toLowerCase()).toBe('svg');
    });

    it('should have icon as first child', () => {
      const { container } = render(<AdminLink />);

      const link = container.querySelector('a');
      const firstChild = link?.firstChild;

      // First child should be the icon (SVG)
      expect(firstChild?.nodeName.toLowerCase()).toBe('svg');
    });

    it('should have text as second child', () => {
      render(<AdminLink />);

      const link = screen.getByRole('link', { name: /admin/i });
      const textNode = Array.from(link.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === 'Admin'
      );

      expect(textNode).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should render consistently across multiple instances', () => {
      const { rerender } = render(<AdminLink />);

      const firstLink = screen.getByRole('link', { name: /admin/i });
      expect(firstLink).toHaveAttribute('href', '/admin');

      rerender(<AdminLink />);

      const secondLink = screen.getByRole('link', { name: /admin/i });
      expect(secondLink).toHaveAttribute('href', '/admin');
      expect(secondLink).toHaveClass('flex', 'items-center', 'gap-2');
    });

    it('should not break when rendered in different contexts', () => {
      const { container } = render(
        <div>
          <nav>
            <AdminLink />
          </nav>
        </div>
      );

      const link = container.querySelector('a[href="/admin"]');
      expect(link).toBeInTheDocument();
    });
  });
});
