/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';

import type { ArtistContactLink } from '@/lib/types/domain/artist';

import { ContactLinkSection, LinkItem, LinkSection } from './link-section';

/** Whether `later` comes after `earlier` in document order. */
const follows = (earlier: Element, later: Element): boolean =>
  Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

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
        link={{ label: 'Shop', description: null, url: 'https://www.shop.example.com/merch' }}
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
    render(
      <LinkItem
        section="contact"
        link={{ label: 'Agent', description: null, url: 'mailto:a@example.com' }}
      />
    );

    const link = screen.getByRole('link', { name: 'a@example.com' });
    expect(link).toHaveAttribute('href', 'mailto:a@example.com');
    expect(link).not.toHaveAttribute('target');
  });

  it('shows the number of a tel: contact link', () => {
    render(
      <LinkItem
        section="contact"
        link={{ label: null, description: null, url: 'tel:+18605550134' }}
      />
    );

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

// ADR-0020 amendment: a Contact & Misc link may carry a description, shown
// between its label and the link; the label is the bolder of the two.
describe('LinkItem in Contact & Misc', () => {
  const agent: ArtistContactLink = {
    label: 'Agent',
    description: 'Books North American tours',
    url: 'mailto:a@example.com',
  };

  it('shows the label in semibold, as plain text', () => {
    render(<LinkItem section="contact" link={agent} />);

    const label = screen.getByText('Agent');
    expect(label).toHaveClass('font-semibold', 'text-zinc-700');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the label in semibold on a link without a description', () => {
    render(<LinkItem section="contact" link={{ ...agent, description: null }} />);

    expect(screen.getByText('Agent')).toHaveClass('font-semibold');
  });

  it('shows the description in normal weight, in the label’s size and colour', () => {
    render(<LinkItem section="contact" link={agent} />);

    expect(screen.getByText('Books North American tours')).toHaveClass(
      'font-normal',
      'text-sm',
      'text-zinc-700'
    );
  });

  it('puts the description after the label and before the link', () => {
    render(<LinkItem section="contact" link={agent} />);

    const description = screen.getByText('Books North American tours');
    expect(follows(screen.getByText('Agent'), description)).toBe(true);
    expect(follows(description, screen.getByRole('link', { name: 'a@example.com' }))).toBe(true);
  });

  it('lets a long description wrap instead of truncating it', () => {
    render(<LinkItem section="contact" link={agent} />);

    const description = screen.getByText('Books North American tours');
    expect(description).toHaveClass('break-words');
    expect(description).not.toHaveClass('truncate');
  });

  it.each([null, ''])('renders no description element for %j', (description) => {
    const { container } = render(<LinkItem section="contact" link={{ ...agent, description }} />);

    expect(container.querySelector('.font-normal')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent(/^Agenta@example\.com$/);
  });

  it('shows markup in a description as the text it is', () => {
    const { container } = render(
      <LinkItem section="contact" link={{ ...agent, description: '<b>x</b>' }} />
    );

    expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('shows the description of a link that has no label, before the link', () => {
    render(<LinkItem section="contact" link={{ ...agent, label: null }} />);

    const description = screen.getByText('Books North American tours');
    expect(description).toHaveClass('font-normal');
    expect(follows(description, screen.getByRole('link', { name: 'a@example.com' }))).toBe(true);
  });

  it('shows the description when the label is the link text and so is not shown', () => {
    render(<LinkItem section="contact" link={{ ...agent, label: 'a@example.com' }} />);

    expect(screen.getAllByText('a@example.com')).toHaveLength(1);
    expect(screen.getByText('Books North American tours')).toBeInTheDocument();
  });

  // The description belongs to Contact & Misc alone, whatever the object holds.
  it.each(['websites', 'social'] as const)(
    'shows no description and no semibold label on a %s row',
    (section) => {
      const link: ArtistContactLink = {
        label: 'Official site',
        description: 'Stray description',
        url: 'https://example.com/x',
      };

      const { container } = render(<LinkItem section={section} link={link} />);

      expect(screen.queryByText('Stray description')).not.toBeInTheDocument();
      expect(container.querySelector('.font-normal')).toBeNull();
      expect(screen.getByText('Official site')).not.toHaveClass('font-semibold');
    }
  );
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
          {
            heading: 'Booking',
            links: [{ label: 'US', description: null, url: 'mailto:us@example.com' }],
          },
          {
            heading: 'Booking',
            links: [{ label: 'EU', description: null, url: 'mailto:eu@example.com' }],
          },
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
          {
            heading: 'Booking',
            links: [{ label: 'Agent', description: null, url: 'mailto:a@example.com' }],
          },
          { heading: 'Merch', links: [] },
          {
            heading: 'Press',
            links: [{ label: null, description: null, url: 'https://example.com/press' }],
          },
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

  it('shows each link’s description in its group', () => {
    render(
      <ContactLinkSection
        groups={[
          {
            heading: 'Booking',
            links: [
              { label: 'Agent', description: 'Books US tours', url: 'mailto:a@example.com' },
              { label: 'Office', description: null, url: 'tel:+18605550134' },
            ],
          },
        ]}
      />
    );

    const rows = within(screen.getByRole('region', { name: 'Contact & Misc' })).getAllByRole(
      'listitem'
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      'AgentBooks US toursa@example.com',
      'Office+18605550134',
    ]);
  });
});
