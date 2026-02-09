import { render, screen } from '@testing-library/react';

import { TipJarsLink } from './tip-jars';

describe('TipJarsLink', () => {
  it('renders a link to campsite.bio/ceschi', () => {
    render(<TipJarsLink />);

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://campsite.bio/ceschi');
  });

  it('displays Tip Jars text', () => {
    render(<TipJarsLink />);

    expect(screen.getByText('Tip Jars')).toBeInTheDocument();
  });

  it('opens in new tab with noopener for security', () => {
    render(<TipJarsLink />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  describe('external link icon', () => {
    it('renders with correct CDN URL and dimensions', () => {
      render(<TipJarsLink />);

      const icon = screen.getByRole('img', { name: 'Tip Jars' });
      expect(icon).toHaveAttribute(
        'src',
        'https://cdn.fakefourrecords.com/media/icons/external-link-icon.svg'
      );
      expect(icon).toHaveAttribute('width', '22');
      expect(icon).toHaveAttribute('height', '22');
    });

    it('has inline-block display and left margin', () => {
      render(<TipJarsLink />);

      const icon = screen.getByRole('img', { name: 'Tip Jars' });
      expect(icon).toHaveClass('ml-2', 'inline-block');
    });
  });

  describe('styling', () => {
    it('has layout and text styling classes', () => {
      render(<TipJarsLink />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('flex', 'items-center', 'justify-center');
      expect(link).toHaveClass('text-xl', 'text-zinc-50');
    });

    it('has correct spacing', () => {
      render(<TipJarsLink />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('mt-2', 'pb-3');
    });
  });
});
