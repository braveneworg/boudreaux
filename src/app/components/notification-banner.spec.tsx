import { act, fireEvent, render, screen } from '@testing-library/react';

import type { NotificationBanner as NotificationBannerType } from '@/lib/services/notification-banner-service';

import { NotificationBanner } from './notification-banner';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="banner-image" {...props} />
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const createMockNotification = (
  overrides: Partial<NotificationBannerType> = {}
): NotificationBannerType => ({
  id: '1',
  message: 'Test notification message',
  secondaryMessage: null,
  notes: null,
  originalImageUrl: null,
  imageUrl: null,
  linkUrl: null,
  backgroundColor: '#000000',
  isOverlayed: true,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  displayFrom: null,
  displayUntil: null,
  addedById: 'user1',
  publishedAt: new Date(),
  publishedBy: 'user1',
  messageFont: null,
  messageFontSize: null,
  messageContrast: null,
  secondaryMessageFont: null,
  secondaryMessageFontSize: null,
  secondaryMessageContrast: null,
  messageTextColor: null,
  secondaryMessageTextColor: null,
  messageTextShadow: null,
  messageTextShadowDarkness: null,
  secondaryMessageTextShadow: null,
  secondaryMessageTextShadowDarkness: null,
  messagePositionX: null,
  messagePositionY: null,
  secondaryMessagePositionX: null,
  secondaryMessagePositionY: null,
  ...overrides,
});

describe('NotificationBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when notifications array is empty', () => {
    const { container } = render(<NotificationBanner notifications={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner with a single notification', () => {
    const notification = createMockNotification({ message: 'Welcome to our site!' });
    render(<NotificationBanner notifications={[notification]} />);

    expect(screen.getByText('Welcome to our site!')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Notification banner');
  });

  it('renders secondary message when provided', () => {
    const notification = createMockNotification({
      message: 'Main message',
      secondaryMessage: 'Secondary message',
    });
    render(<NotificationBanner notifications={[notification]} />);

    expect(screen.getByText('Main message')).toBeInTheDocument();
    expect(screen.getByText('Secondary message')).toBeInTheDocument();
  });

  it('renders navigation dots when multiple notifications exist', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
      createMockNotification({ id: '3', message: 'Third' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const dots = screen.getAllByRole('tab');
    expect(dots).toHaveLength(3);
  });

  it('does not render navigation dots for single notification', () => {
    const notification = createMockNotification();
    render(<NotificationBanner notifications={[notification]} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('allows navigation via dots', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First notification' }),
      createMockNotification({ id: '2', message: 'Second notification' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    expect(screen.getByText('First notification')).toBeInTheDocument();

    const secondDot = screen.getAllByRole('tab')[1];
    fireEvent.click(secondDot);

    expect(screen.getByText('Second notification')).toBeInTheDocument();
  });

  it('marks the active dot as selected', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
    expect(dots[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('auto-cycles through notifications every 10 seconds', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    expect(screen.getByText('First')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Second')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('pauses auto-cycling on mouse enter', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const banner = screen.getByRole('region');
    fireEvent.mouseEnter(banner);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByText('First')).toBeInTheDocument();
  });

  it('resumes auto-cycling on mouse leave', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const banner = screen.getByRole('region');
    fireEvent.mouseEnter(banner);
    fireEvent.mouseLeave(banner);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('supports keyboard navigation with arrow keys', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
      createMockNotification({ id: '3', message: 'Third' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const banner = screen.getByRole('region');
    banner.focus();

    fireEvent.keyDown(banner, { key: 'ArrowRight' });
    expect(screen.getByText('Second')).toBeInTheDocument();

    fireEvent.keyDown(banner, { key: 'ArrowRight' });
    expect(screen.getByText('Third')).toBeInTheDocument();

    fireEvent.keyDown(banner, { key: 'ArrowLeft' });
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('wraps around when navigating past boundaries', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const banner = screen.getByRole('region');
    banner.focus();

    fireEvent.keyDown(banner, { key: 'ArrowLeft' });
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders image when imageUrl is provided', () => {
    const notification = createMockNotification({
      imageUrl: 'https://example.com/banner.jpg',
      message: 'Banner with image',
    });
    render(<NotificationBanner notifications={[notification]} />);

    // Find the visible image (not the preload image which has empty alt)
    const images = screen.getAllByTestId('banner-image');
    const visibleImage = images.find((img) => img.getAttribute('alt') === 'Banner with image');
    expect(visibleImage).toHaveAttribute('src', 'https://example.com/banner.jpg');
    expect(visibleImage).toHaveAttribute('alt', 'Banner with image');
  });

  it('renders link when linkUrl is provided', () => {
    const notification = createMockNotification({
      linkUrl: 'https://example.com/page',
      message: 'Clickable banner',
    });
    render(<NotificationBanner notifications={[notification]} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render link when linkUrl is not provided', () => {
    const notification = createMockNotification({ linkUrl: null, message: 'Non-clickable banner' });
    render(<NotificationBanner notifications={[notification]} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const notification = createMockNotification();
    render(<NotificationBanner notifications={[notification]} className="custom-class" />);

    expect(screen.getByRole('region')).toHaveClass('custom-class');
  });

  it('applies golden ratio aspect ratio', () => {
    const notification = createMockNotification();
    render(<NotificationBanner notifications={[notification]} />);

    const container = screen.getByRole('region').querySelector('[style*="padding-bottom"]');
    // Golden ratio: 100 / 1.618 ≈ 61.8%
    expect(container).toHaveStyle({ paddingBottom: `${100 / 1.618}%` });
  });

  it('renders with proper ARIA roles for accessibility', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    expect(screen.getByRole('region')).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Banner navigation');

    const slide = screen.getByRole('group');
    expect(slide).toHaveAttribute('aria-roledescription', 'slide');
    expect(slide).toHaveAttribute('aria-label', '1 of 2');
  });

  it('pauses on focus and resumes on blur', () => {
    const notifications = [
      createMockNotification({ id: '1', message: 'First' }),
      createMockNotification({ id: '2', message: 'Second' }),
    ];
    render(<NotificationBanner notifications={notifications} />);

    const banner = screen.getByRole('region');
    fireEvent.focus(banner);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByText('First')).toBeInTheDocument();

    fireEvent.blur(banner);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('does not show text when isOverlayed is false', () => {
    const notification = createMockNotification({
      message: 'Hidden message',
      secondaryMessage: 'Hidden secondary',
      isOverlayed: false,
    });
    render(<NotificationBanner notifications={[notification]} />);

    expect(screen.queryByText('Hidden message')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden secondary')).not.toBeInTheDocument();
  });
});
