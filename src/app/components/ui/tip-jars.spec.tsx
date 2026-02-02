import { render, screen } from '@testing-library/react';

import { TipJarsLink } from './tip-jars';

describe('TipJarsLink', () => {
  it('renders', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('has correct href', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://campsite.bio/ceschi');
  });

  it('displays Tip Jars text', () => {
    render(<TipJarsLink />);

    expect(screen.getByText('Tip Jars')).toBeInTheDocument();
  });

  it('opens in new tab', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('has noopener for security', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener');
  });

  it('renders external link icon', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('img', { name: 'Tip Jars' })).toBeInTheDocument();
  });

  it('external link icon has correct src', () => {
    render(<TipJarsLink />);

    const icon = screen.getByRole('img', { name: 'Tip Jars' });
    expect(icon).toHaveAttribute('src', expect.stringContaining('external-link-icon.svg'));
  });

  it('has styling classes for layout', () => {
    render(<TipJarsLink />);

    expect(screen.getByRole('link')).toHaveClass('flex', 'items-center', 'justify-center');
  });
});
