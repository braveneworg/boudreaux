import { render, screen } from '@testing-library/react';

import SocialMediaIconLinks from './social-media-icon-links';

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://facebook.com/fakefourinc', testId: 'facebook-icon' },
  { label: 'Instagram', href: 'https://instagram.com/fakefourinc', testId: 'instagram-icon' },
  { label: 'YouTube', href: 'https://YouTube.com/fakefourinc', testId: 'youtube-icon' },
  { label: 'Bandcamp', href: 'https://fakefour.bandcamp.com', testId: 'bandcamp-icon' },
  { label: 'X', href: 'https://x.com/fakefour', testId: 'x-icon' },
  { label: 'TikTok', href: 'https://tiktok.com/@fakefourinc', testId: 'tiktok-icon' },
  { label: 'Spotify', href: 'https://open.spotify.com/user/fakefourinc', testId: 'spotify-icon' },
];

describe('SocialMediaIconLinks', () => {
  it('renders all seven social media links', () => {
    render(<SocialMediaIconLinks className="" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(7);
  });

  it.each(SOCIAL_LINKS)('renders $label icon with correct testid', ({ testId }) => {
    render(<SocialMediaIconLinks className="" />);

    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  describe('link hrefs', () => {
    it.each(SOCIAL_LINKS)('$label link points to $href', ({ testId, href }) => {
      render(<SocialMediaIconLinks className="" />);

      expect(screen.getByTestId(testId)).toHaveAttribute('href', href);
    });
  });

  describe('accessibility', () => {
    it.each(SOCIAL_LINKS)('$label link has aria-label', ({ label }) => {
      render(<SocialMediaIconLinks className="" />);

      expect(screen.getByLabelText(label)).toBeInTheDocument();
    });

    it.each(SOCIAL_LINKS)('$label link has title attribute', ({ testId, label }) => {
      render(<SocialMediaIconLinks className="" />);

      expect(screen.getByTestId(testId)).toHaveAttribute('title', label);
    });

    it('renders images with alt text for all links', () => {
      render(<SocialMediaIconLinks className="" />);

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(7);

      SOCIAL_LINKS.forEach(({ label }) => {
        expect(screen.getByAltText(label)).toBeInTheDocument();
      });
    });

    it('has screen reader text for each link', () => {
      render(<SocialMediaIconLinks className="" />);

      const srTexts = document.querySelectorAll('.sr-only');
      expect(srTexts).toHaveLength(7);
    });
  });

  describe('link attributes', () => {
    it('links open in new tab with noopener', () => {
      render(<SocialMediaIconLinks className="" />);

      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener');
      });
    });

    it('links have transition styling for hover effect', () => {
      render(<SocialMediaIconLinks className="" />);

      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        expect(link).toHaveClass('transition-transform');
      });
    });
  });

  describe('container styling', () => {
    it('applies custom className', () => {
      render(<SocialMediaIconLinks className="custom-class" />);

      const container = screen.getByTestId('facebook-icon').parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('has flex layout with justify-end alignment', () => {
      render(<SocialMediaIconLinks className="" />);

      const container = screen.getByTestId('facebook-icon').parentElement;
      expect(container).toHaveClass('flex', 'flex-wrap', 'justify-end');
    });

    it('has padding for spacing', () => {
      render(<SocialMediaIconLinks className="" />);

      const container = screen.getByTestId('facebook-icon').parentElement;
      expect(container).toHaveClass('pt-4');
    });
  });
});
