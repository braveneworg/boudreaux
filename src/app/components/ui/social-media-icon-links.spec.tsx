import { render, screen } from '@testing-library/react';

import SocialMediaIconLinks from './social-media-icon-links';

describe('SocialMediaIconLinks', () => {
  it('renders', () => {
    render(<SocialMediaIconLinks className="test-class" />);

    expect(screen.getByTestId('facebook-icon')).toBeInTheDocument();
  });

  it('renders all social media links', () => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByTestId('facebook-icon')).toBeInTheDocument();
    expect(screen.getByTestId('instagram-icon')).toBeInTheDocument();
    expect(screen.getByTestId('youtube-icon')).toBeInTheDocument();
    expect(screen.getByTestId('bandcamp-icon')).toBeInTheDocument();
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
    expect(screen.getByTestId('tiktok-icon')).toBeInTheDocument();
    expect(screen.getByTestId('spotify-icon')).toBeInTheDocument();
  });

  it('has correct number of links', () => {
    render(<SocialMediaIconLinks className="" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
  });

  it('links have aria-label', () => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
    expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
    expect(screen.getByLabelText('YouTube')).toBeInTheDocument();
    expect(screen.getByLabelText('Bandcamp')).toBeInTheDocument();
    expect(screen.getByLabelText('X')).toBeInTheDocument();
    expect(screen.getByLabelText('TikTok')).toBeInTheDocument();
    expect(screen.getByLabelText('Spotify')).toBeInTheDocument();
  });

  it('links open in new tab', () => {
    render(<SocialMediaIconLinks className="" />);

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('links have noopener for security', () => {
    render(<SocialMediaIconLinks className="" />);

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener');
    });
  });

  it('Facebook link has correct href', () => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByTestId('facebook-icon')).toHaveAttribute(
      'href',
      'https://facebook.com/fakefourinc'
    );
  });

  it('Instagram link has correct href', () => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByTestId('instagram-icon')).toHaveAttribute(
      'href',
      'https://instagram.com/fakefourinc'
    );
  });

  it('renders icons as images', () => {
    render(<SocialMediaIconLinks className="" />);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(7);
  });

  it('images have alt text', () => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByAltText('Facebook')).toBeInTheDocument();
    expect(screen.getByAltText('Instagram')).toBeInTheDocument();
    expect(screen.getByAltText('YouTube')).toBeInTheDocument();
    expect(screen.getByAltText('Bandcamp')).toBeInTheDocument();
    expect(screen.getByAltText('X')).toBeInTheDocument();
    expect(screen.getByAltText('TikTok')).toBeInTheDocument();
    expect(screen.getByAltText('Spotify')).toBeInTheDocument();
  });

  it('has screen reader text for each link', () => {
    render(<SocialMediaIconLinks className="" />);

    const srTexts = document.querySelectorAll('.sr-only');
    expect(srTexts).toHaveLength(7);
  });

  it('applies custom className', () => {
    render(<SocialMediaIconLinks className="custom-class" />);

    const container = screen.getByTestId('facebook-icon').parentElement;
    expect(container).toHaveClass('custom-class');
  });

  it('has flex layout classes', () => {
    render(<SocialMediaIconLinks className="" />);

    const container = screen.getByTestId('facebook-icon').parentElement;
    expect(container).toHaveClass('flex', 'flex-wrap');
  });
});
