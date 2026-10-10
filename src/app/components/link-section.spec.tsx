/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import { ContactLinkSection, LinkItem, LinkSection } from './link-section';

describe('LinkSection', () => {
  it('renders nothing for an empty section', () => {
    const { container } = render(<LinkSection heading="Websites" section="websites" links={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('is a section named by its heading, one row per link in order', () => {
    render(
      <LinkSection
        heading="Websites"
        section="websites"
        links={[
          { label: 'Official site', url: 'https://margueriteash.example.com' },
          { label: null, url: 'https://margueriteash.bandcamp.com' },
        ]}
      />
    );

    const section = screen.getByRole('region', { name: 'Websites' });
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Websites');
    const links = within(section).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'margueriteash.example.com',
      'margueriteash.bandcamp.com',
    ]);
  });
});

describe('LinkSection keys', () => {
  // Nothing forbids two rows with the same URL (two labels for one shop
  // page), so the list must not key its rows by URL alone.
  it('renders two links to the same URL as two rows, without a key collision', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <LinkSection
        heading="Websites"
        section="websites"
        links={[
          { label: 'Shop', url: 'https://band.example.com' },
          { label: 'Tour', url: 'https://band.example.com' },
        ]}
      />
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('Shop')).toBeInTheDocument();
    expect(screen.getByText('Tour')).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('LinkItem', () => {
  it('shows the label beside the link and the address after the www as the link text', () => {
    render(
      <LinkItem
        section="websites"
        link={{ label: 'Official site', url: 'https://www.example.com/x' }}
      />
    );

    expect(screen.getByText('Official site')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'example.com/x' })).toHaveAttribute(
      'href',
      'https://www.example.com/x'
    );
  });

  it('shows the profile path of a social link, without its trailing slash', () => {
    render(
      <LinkItem
        section="social"
        link={{ label: null, url: 'https://www.instagram.com/ceschiramos/' }}
      />
    );

    expect(screen.getByRole('link')).toHaveTextContent(/^instagram\.com\/ceschiramos$/);
  });

  it('keeps the query and the fragment of a website link in its text', () => {
    render(
      <LinkItem
        section="websites"
        link={{ label: null, url: 'https://www.youtube.com/watch?v=abc123#t=10' }}
      />
    );

    expect(screen.getByRole('link')).toHaveTextContent(/^youtube\.com\/watch\?v=abc123#t=10$/);
  });

  it('shows only the host of a website link that has no path', () => {
    render(<LinkItem section="websites" link={{ label: null, url: 'https://www.example.com/' }} />);

    expect(screen.getByRole('link')).toHaveTextContent(/^example\.com$/);
  });

  // The longer text is for Websites and Social Media only.
  it('shows only the host of an http contact link', () => {
    render(
      <LinkItem
        section="contact"
        link={{ label: 'Shop', url: 'https://www.shop.example.com/merch' }}
      />
    );

    expect(screen.getByRole('link')).toHaveTextContent(/^shop\.example\.com$/);
  });

  it('hardens an external link', () => {
    render(<LinkItem section="websites" link={{ label: null, url: 'https://example.com' }} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the address of a mailto: contact link, same tab', () => {
    render(<LinkItem section="contact" link={{ label: 'Agent', url: 'mailto:a@example.com' }} />);

    const link = screen.getByRole('link', { name: 'a@example.com' });
    expect(link).toHaveAttribute('href', 'mailto:a@example.com');
    expect(link).not.toHaveAttribute('target');
  });

  it('shows the number of a tel: contact link', () => {
    render(<LinkItem section="contact" link={{ label: null, url: 'tel:+18605550134' }} />);

    expect(screen.getByRole('link', { name: '+18605550134' })).toHaveAttribute(
      'href',
      'tel:+18605550134'
    );
  });

  it('shows the icon the href resolves to', () => {
    const { container } = render(
      <LinkItem section="social" link={{ label: null, url: 'https://www.instagram.com/x' }} />
    );

    expect(container.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'instagram');
  });

  // ADR-0020: the rule, not the write, is what the page trusts.
  it('renders a stored href that fails the rule as text, never as a link', () => {
    render(<LinkItem section="websites" link={{ label: 'Odd', url: 'javascript:alert(1)' }} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('does not repeat a label that is the link text', () => {
    render(
      <LinkItem section="websites" link={{ label: 'example.com', url: 'https://example.com' }} />
    );

    expect(screen.getAllByText('example.com')).toHaveLength(1);
  });

  it('does not repeat a label that is the longer link text', () => {
    render(
      <LinkItem
        section="social"
        link={{ label: 'instagram.com/ceschiramos', url: 'https://instagram.com/ceschiramos' }}
      />
    );

    expect(screen.getAllByText('instagram.com/ceschiramos')).toHaveLength(1);
  });
});

describe('ContactLinkSection', () => {
  it('renders nothing when no group has a link', () => {
    const { container } = render(
      <ContactLinkSection groups={[{ heading: 'Booking', links: [] }]} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders two groups with the same heading, without a key collision', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ContactLinkSection
        groups={[
          { heading: 'Booking', links: [{ label: 'US', url: 'mailto:us@example.com' }] },
          { heading: 'Booking', links: [{ label: 'EU', url: 'mailto:eu@example.com' }] },
        ]}
      />
    );

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is the Contact & Misc section with a subheading per group that has links', () => {
    render(
      <ContactLinkSection
        groups={[
          { heading: 'Booking', links: [{ label: 'Agent', url: 'mailto:a@example.com' }] },
          { heading: 'Merch', links: [] },
          { heading: 'Press', links: [{ label: null, url: 'https://example.com/press' }] },
        ]}
      />
    );

    const section = screen.getByRole('region', { name: 'Contact & Misc' });
    expect(
      within(section)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['Booking', 'Press']);
  });
});
