import { render, screen } from '@testing-library/react';

import AboutPage from './page';

// Mock next/image using <span> to avoid @next/next/no-img-element lint rule
vi.mock('next/image', () => ({
  default: function MockImage(props: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
    priority?: boolean;
  }) {
    return (
      <span
        className={props.className}
        data-alt={props.alt}
        data-height={String(props.height)}
        data-priority={props.priority ? 'true' : 'false'}
        data-src={props.src}
        data-testid={`image-${props.alt}`}
        data-width={String(props.width)}
      />
    );
  },
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  },
}));

// Mock UI components
vi.mock('../components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: { anchorText: string; url: string }[] }) => (
    <nav data-testid="breadcrumb">
      {items.map((item) => (
        <a key={item.url} href={item.url}>
          {item.anchorText}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock('../components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

vi.mock('../components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('../components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('../components/ui/page-section', () => ({
  PageSection: ({
    children,
    title,
    id,
  }: {
    children: React.ReactNode;
    title: string;
    id: string;
  }) => (
    <section id={id} data-testid={`section-${id}`}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock('../components/ui/page-section-paragraph', () => ({
  PageSectionParagraph: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="page-paragraph">{children}</p>
  ),
}));

describe('AboutPage', () => {
  it('renders page layout structure', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('renders breadcrumb with About link', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });

  it('renders main heading with anchor id', () => {
    render(<AboutPage />);

    const heading = screen.getByRole('heading', { name: 'About fake four inc.' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute('id', 'about-fake-four-inc');
  });

  describe('images', () => {
    it('renders founders image with correct path, dimensions, and priority', () => {
      render(<AboutPage />);

      const foundersImage = screen.getByTestId(
        'image-Ceschi and David Ramos, founders of Fake Four Inc. in 2008'
      );
      expect(foundersImage).toHaveAttribute(
        'data-src',
        '/media/ceschi-and-david-ramos-brothers-and-fouders-of-fake-four-inc.jpeg'
      );
      expect(foundersImage).toHaveAttribute('data-width', '92');
      expect(foundersImage).toHaveAttribute('data-height', '92');
      expect(foundersImage).toHaveAttribute('data-priority', 'true');
    });

    it('renders This Up Here bandcamp image with correct path and dimensions', () => {
      render(<AboutPage />);

      const bandcampImage = screen.getByTestId(
        "image-Listen to David Ramos' This Up Here on Bandcamp"
      );
      expect(bandcampImage).toHaveAttribute(
        'data-src',
        '/media/listen-david-ramos-this-up-there-bc.png'
      );
      expect(bandcampImage).toHaveAttribute('data-width', '380');
      expect(bandcampImage).toHaveAttribute('data-height', '42');
    });
  });

  describe('description content', () => {
    it('mentions Fake Four Inc. as an independent record label', () => {
      render(<AboutPage />);

      expect(screen.getAllByText(/Fake Four Inc./).length).toBeGreaterThan(0);
      expect(screen.getByText(/independent record label/)).toBeInTheDocument();
    });

    it('mentions founders Ceschi and founding details', () => {
      render(<AboutPage />);

      expect(screen.getAllByText(/Ceschi/).length).toBeGreaterThan(0);
      expect(screen.getByText(/New Haven/)).toBeInTheDocument();
      expect(screen.getByText(/Founded in 2008/)).toBeInTheDocument();
    });
  });

  describe('sections', () => {
    it.each([
      { id: 'history', title: 'History' },
      { id: 'style-and-philosophy', title: 'Style & Philosophy' },
      { id: 'notable-artists', title: 'Notable Artists' },
      { id: 'chart-success', title: 'Chart Success' },
      { id: 'recent-releases', title: 'Recent Releases' },
      { id: 'community-and-impact', title: 'Community & Impact' },
    ])('renders $title section with id "$id"', ({ id, title }) => {
      render(<AboutPage />);

      expect(screen.getByTestId(`section-${id}`)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
  });

  describe('notable artists links', () => {
    it.each([
      { name: 'Astronautalis', href: 'https://astronautalis.bandcamp.com' },
      { name: 'Blue Sky Black Death', href: 'https://blueskyblackdeath.bandcamp.com' },
      { name: 'Busdriver', href: 'https://busdriver-thumbs.bandcamp.com' },
      { name: 'Ceschi', href: 'https://ceschi.bandcamp.com' },
      { name: 'Dark Time Sunshine', href: 'https://darktimesunshine.bandcamp.com' },
      { name: 'Electric President', href: 'https://electricpresident.bandcamp.com' },
      { name: 'Factor Chandelier', href: 'https://factorchandelier.bandcamp.com' },
      { name: 'Myka 9', href: 'https://myka9.bandcamp.com' },
      { name: 'Noah23', href: 'https://noah23.bandcamp.com' },
      { name: 'Open Mike Eagle', href: 'https://openmikeeagle.bandcamp.com' },
      { name: 'Onry Ozzborn', href: 'https://onryozzborn.bandcamp.com' },
      { name: 'Sadistik', href: 'https://sadistik.bandcamp.com' },
      { name: 'Sole', href: 'https://soleillinoise.bandcamp.com' },
      { name: 'Gregory Pepper', href: 'https://gregorypepper.bandcamp.com' },
    ])('renders $name link to $href', ({ name, href }) => {
      render(<AboutPage />);

      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    });

    it('renders three unordered lists for the grid layout', () => {
      const { container } = render(<AboutPage />);

      expect(container.querySelectorAll('ul')).toHaveLength(3);
    });

    it('shows And many more text', () => {
      render(<AboutPage />);

      expect(screen.getByText('And many more...')).toBeInTheDocument();
    });
  });

  describe('bandcamp link in History', () => {
    it('renders David Ramos bandcamp link wrapping the album image', () => {
      render(<AboutPage />);

      const bandcampImage = screen.getByTestId(
        "image-Listen to David Ramos' This Up Here on Bandcamp"
      );
      const parentLink = bandcampImage.closest('a');
      expect(parentLink).toHaveAttribute(
        'href',
        'https://davidramos.bandcamp.com/album/this-up-here'
      );
    });
  });

  describe('history section content', () => {
    it('mentions Grimm Image Records origin', () => {
      render(<AboutPage />);

      expect(screen.getByText(/Grimm Image Records/)).toBeInTheDocument();
    });

    it('mentions Indiegogo campaign raising $52,000', () => {
      render(<AboutPage />);

      expect(screen.getByText(/Indiegogo/)).toBeInTheDocument();
      expect(screen.getByText(/\$52,000/)).toBeInTheDocument();
    });

    it('mentions Modern Drummer recognition', () => {
      render(<AboutPage />);

      expect(screen.getByText(/Modern Drummer/)).toBeInTheDocument();
    });
  });

  describe('chart success section content', () => {
    it('mentions CMJ charts and Dark Time Sunshine Vessel album', () => {
      render(<AboutPage />);

      expect(screen.getByText(/CMJ/)).toBeInTheDocument();
      expect(screen.getByText(/Vessel/)).toBeInTheDocument();
    });
  });
});
