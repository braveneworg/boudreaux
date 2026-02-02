import { render, screen } from '@testing-library/react';

import AboutPage from './page';

// Mock next/image
vi.mock('next/image', () => ({
  default: function MockImage(props: { src: string; alt: string; width: number; height: number }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} width={props.width} height={props.height} />;
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
  it('renders page container', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('renders content container', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('renders breadcrumb with About link', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });

  it('renders card with content', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByTestId('card-content')).toBeInTheDocument();
  });

  it('renders main heading', () => {
    render(<AboutPage />);

    expect(screen.getByRole('heading', { name: 'About fake four inc.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About fake four inc.' })).toHaveAttribute(
      'id',
      'about-fake-four-inc'
    );
  });

  it('renders founders image', () => {
    render(<AboutPage />);

    expect(
      screen.getByAltText('Ceschi and David Ramos, founders of Fake Four Inc. in 2008')
    ).toBeInTheDocument();
  });

  it('renders Fake Four Inc. description', () => {
    render(<AboutPage />);

    expect(screen.getAllByText(/Fake Four Inc./).length).toBeGreaterThan(0);
    expect(screen.getByText(/independent record label/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ceschi/).length).toBeGreaterThan(0);
  });

  it('renders History section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-history')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
  });

  it('renders Style and Philosophy section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-style-and-philosophy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Style & Philosophy' })).toBeInTheDocument();
  });

  it('renders Notable Artists section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-notable-artists')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notable Artists' })).toBeInTheDocument();
  });

  it('renders links to notable artists', () => {
    render(<AboutPage />);

    expect(screen.getByRole('link', { name: 'Astronautalis' })).toHaveAttribute(
      'href',
      'https://astronautalis.bandcamp.com'
    );
    expect(screen.getByRole('link', { name: 'Ceschi' })).toHaveAttribute(
      'href',
      'https://ceschi.bandcamp.com'
    );
    expect(screen.getByRole('link', { name: 'Open Mike Eagle' })).toHaveAttribute(
      'href',
      'https://openmikeeagle.bandcamp.com'
    );
  });

  it('renders Chart Success section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-chart-success')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chart Success' })).toBeInTheDocument();
  });

  it('renders Recent Releases section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-recent-releases')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Releases' })).toBeInTheDocument();
  });

  it('renders Community and Impact section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('section-community-and-impact')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Community & Impact' })).toBeInTheDocument();
  });

  it('renders This Up Here bandcamp link', () => {
    render(<AboutPage />);

    expect(
      screen.getByAltText("Listen to David Ramos' This Up Here on Bandcamp")
    ).toBeInTheDocument();
  });
});
