import { act, fireEvent, render, screen } from '@testing-library/react';

import type { NotificationBanner as NotificationBannerType } from '@/lib/services/notification-banner-service';

import { NotificationBanner } from './notification-banner';

// Mock framer-motion
let mockOnDragEnd:
  | ((event: unknown, info: { offset: { x: number }; velocity: { x: number } }) => void)
  | undefined;

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      onDragEnd,
      drag,
      dragConstraints,
      dragElastic,
      style,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      onDragEnd?: (
        event: unknown,
        info: { offset: { x: number }; velocity: { x: number } }
      ) => void;
      drag?: 'x' | 'y' | boolean;
      dragConstraints?: { left?: number; right?: number };
      dragElastic?: number;
      style?: React.CSSProperties;
    }) => {
      // Store the onDragEnd callback for testing
      mockOnDragEnd = onDragEnd;
      return (
        <div
          {...props}
          style={style}
          data-drag={drag ? String(drag) : undefined}
          data-drag-constraints={dragConstraints ? JSON.stringify(dragConstraints) : undefined}
          data-drag-elastic={dragElastic !== undefined ? String(dragElastic) : undefined}
          data-touch-action={style?.touchAction}
        >
          {children}
        </div>
      );
    },
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
  messageRotation: null,
  secondaryMessageRotation: null,
  imageOffsetX: null,
  imageOffsetY: null,
  messageWidth: null,
  messageHeight: null,
  secondaryMessageWidth: null,
  secondaryMessageHeight: null,
  ...overrides,
});

describe('NotificationBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockOnDragEnd = undefined;
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

  describe('swipe navigation', () => {
    it('enables drag on x-axis when multiple notifications exist', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      const slide = screen.getByRole('group');
      expect(slide).toHaveAttribute('data-drag', 'x');
      expect(slide).toHaveAttribute('data-drag-constraints', JSON.stringify({ left: 0, right: 0 }));
      expect(slide).toHaveAttribute('data-drag-elastic', '0.2');
    });

    it('disables drag when only one notification exists', () => {
      const notification = createMockNotification({ id: '1', message: 'Only one' });
      render(<NotificationBanner notifications={[notification]} />);

      const slide = screen.getByRole('group');
      expect(slide).not.toHaveAttribute('data-drag');
    });

    it('navigates to next notification on swipe left (negative offset)', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
        createMockNotification({ id: '3', message: 'Third' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      expect(screen.getByText('First')).toBeInTheDocument();

      // Simulate swipe left with offset beyond threshold
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: -60 }, velocity: { x: 0 } });
      });

      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('navigates to previous notification on swipe right (positive offset)', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
        createMockNotification({ id: '3', message: 'Third' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      // First navigate to second notification
      const secondDot = screen.getAllByRole('tab')[1];
      fireEvent.click(secondDot);
      expect(screen.getByText('Second')).toBeInTheDocument();

      // Simulate swipe right with offset beyond threshold
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: 60 }, velocity: { x: 0 } });
      });

      expect(screen.getByText('First')).toBeInTheDocument();
    });

    it('navigates to next notification on fast swipe left (high negative velocity)', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      expect(screen.getByText('First')).toBeInTheDocument();

      // Simulate fast swipe with velocity but small offset
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: -20 }, velocity: { x: -600 } });
      });

      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('navigates to previous notification on fast swipe right (high positive velocity)', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      // First navigate to second notification
      const secondDot = screen.getAllByRole('tab')[1];
      fireEvent.click(secondDot);
      expect(screen.getByText('Second')).toBeInTheDocument();

      // Simulate fast swipe with velocity but small offset
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: 20 }, velocity: { x: 600 } });
      });

      expect(screen.getByText('First')).toBeInTheDocument();
    });

    it('does not navigate when swipe is below threshold', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      expect(screen.getByText('First')).toBeInTheDocument();

      // Simulate small swipe below threshold
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: -30 }, velocity: { x: -200 } });
      });

      // Should stay on first notification
      expect(screen.getByText('First')).toBeInTheDocument();
    });

    it('wraps to last notification when swiping right from first', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
        createMockNotification({ id: '3', message: 'Third' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      expect(screen.getByText('First')).toBeInTheDocument();

      // Simulate swipe right from first notification
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: 60 }, velocity: { x: 0 } });
      });

      // Should wrap to last notification
      expect(screen.getByText('Third')).toBeInTheDocument();
    });

    it('wraps to first notification when swiping left from last', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
        createMockNotification({ id: '3', message: 'Third' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      // Navigate to last notification
      const lastDot = screen.getAllByRole('tab')[2];
      fireEvent.click(lastDot);
      expect(screen.getByText('Third')).toBeInTheDocument();

      // Simulate swipe left from last notification
      act(() => {
        mockOnDragEnd?.(new MouseEvent('mouseup'), { offset: { x: -60 }, velocity: { x: 0 } });
      });

      // Should wrap to first notification
      expect(screen.getByText('First')).toBeInTheDocument();
    });

    it('has proper touch-action style for vertical scrolling', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      const slide = screen.getByRole('group');
      // Check that the touch-action style is set to pan-y via data attribute
      expect(slide).toHaveAttribute('data-touch-action', 'pan-y');
    });

    it('has grab cursor classes for drag feedback', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First' }),
        createMockNotification({ id: '2', message: 'Second' }),
      ];
      render(<NotificationBanner notifications={notifications} />);

      const slide = screen.getByRole('group');
      expect(slide).toHaveClass('cursor-grab');
      expect(slide).toHaveClass('active:cursor-grabbing');
    });
  });

  describe('text rotation', () => {
    it('should render message with rotation transform when messageRotation is set', () => {
      const notification = createMockNotification({
        message: 'Rotated banner text',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        messageRotation: 15,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const messageElement = screen.getByText('Rotated banner text');
      expect(messageElement).toBeInTheDocument();
      // Rotation is now on the parent container div
      expect(messageElement.parentElement?.style.transform).toContain('rotate(15deg)');
    });

    it('should render secondary message with rotation transform when secondaryMessageRotation is set', () => {
      const notification = createMockNotification({
        message: 'Primary',
        secondaryMessage: 'Rotated secondary text',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        secondaryMessageRotation: -20,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const secondaryElement = screen.getByText('Rotated secondary text');
      expect(secondaryElement).toBeInTheDocument();
      // Rotation is now on the parent container div
      expect(secondaryElement.parentElement?.style.transform).toContain('rotate(-20deg)');
    });

    it('should apply zero rotation when messageRotation is 0', () => {
      const notification = createMockNotification({
        message: 'No rotation text',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        messageRotation: 0,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const messageElement = screen.getByText('No rotation text');
      // Rotation is now on the parent container div
      expect(messageElement.parentElement?.style.transform).toContain('rotate(0deg)');
    });

    it('should handle null rotation values with default 0 rotation', () => {
      const notification = createMockNotification({
        message: 'Default rotation',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        messageRotation: null,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const messageElement = screen.getByText('Default rotation');
      // Rotation is now on the parent container div
      expect(messageElement.parentElement?.style.transform).toContain('rotate(0deg)');
    });

    it('should render with maximum positive rotation', () => {
      const notification = createMockNotification({
        message: 'Max rotation',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        messageRotation: 360,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const messageElement = screen.getByText('Max rotation');
      // Rotation is now on the parent container div
      expect(messageElement.parentElement?.style.transform).toContain('rotate(360deg)');
    });

    it('should render with maximum negative rotation', () => {
      const notification = createMockNotification({
        message: 'Negative rotation',
        isOverlayed: true,
        imageUrl: 'https://example.com/banner.jpg',
        messageRotation: -360,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const messageElement = screen.getByText('Negative rotation');
      // Rotation is now on the parent container div
      expect(messageElement.parentElement?.style.transform).toContain('rotate(-360deg)');
    });
  });

  describe('image offset', () => {
    it('should render image with objectPosition when imageOffsetX and imageOffsetY are set', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/offset-image.jpg',
        imageOffsetX: 30,
        imageOffsetY: -15,
      });

      render(<NotificationBanner notifications={[notification]} />);

      // Component renders two images: one for preloading (hidden) and one for display
      const images = screen.getAllByTestId('banner-image');
      // The displayed image (not hidden) has the object-position style
      const displayedImage = images.find((img) =>
        img.style.objectPosition?.includes('calc(50% + 30%)')
      );
      expect(displayedImage).toBeInTheDocument();
      expect(displayedImage).toHaveAttribute('src', 'https://example.com/offset-image.jpg');
      expect(displayedImage).toHaveStyle({
        objectPosition: 'calc(50% + 30%) calc(50% + -15%)',
      });
    });

    it('should render image with zero offset values', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: 0,
        imageOffsetY: 0,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const displayedImage = images.find((img) =>
        img.style.objectPosition?.includes('calc(50% + 0%)')
      );
      expect(displayedImage).toBeInTheDocument();
      expect(displayedImage).toHaveStyle({
        objectPosition: 'calc(50% + 0%) calc(50% + 0%)',
      });
    });

    it('should handle null offset values with default 0', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: null,
        imageOffsetY: null,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const displayedImage = images.find((img) =>
        img.style.objectPosition?.includes('calc(50% + 0%)')
      );
      expect(displayedImage).toBeInTheDocument();
      expect(displayedImage).toHaveStyle({
        objectPosition: 'calc(50% + 0%) calc(50% + 0%)',
      });
    });

    it('should render image with positive offset values', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: 100,
        imageOffsetY: 100,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const displayedImage = images.find((img) =>
        img.style.objectPosition?.includes('calc(50% + 100%)')
      );
      expect(displayedImage).toBeInTheDocument();
      expect(displayedImage).toHaveStyle({
        objectPosition: 'calc(50% + 100%) calc(50% + 100%)',
      });
    });

    it('should render image with negative offset values', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: -100,
        imageOffsetY: -100,
      });

      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const displayedImage = images.find((img) =>
        img.style.objectPosition?.includes('calc(50% + -100%)')
      );
      expect(displayedImage).toBeInTheDocument();
      expect(displayedImage).toHaveStyle({
        objectPosition: 'calc(50% + -100%) calc(50% + -100%)',
      });
    });
  });

  describe('image URL fallback behavior', () => {
    it('uses originalImageUrl when isOverlayed is true and both URLs exist', () => {
      const notification = createMockNotification({
        message: 'Test message',
        originalImageUrl: 'https://example.com/original.jpg',
        imageUrl: 'https://example.com/processed.jpg',
        isOverlayed: true,
      });
      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const visibleImage = images.find((img) => img.getAttribute('alt') === 'Test message');
      expect(visibleImage).toHaveAttribute('src', 'https://example.com/original.jpg');
    });

    it('falls back to imageUrl when isOverlayed is true but originalImageUrl is null', () => {
      const notification = createMockNotification({
        message: 'Test message',
        originalImageUrl: null,
        imageUrl: 'https://example.com/processed.jpg',
        isOverlayed: true,
      });
      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      const visibleImage = images.find((img) => img.getAttribute('alt') === 'Test message');
      expect(visibleImage).toHaveAttribute('src', 'https://example.com/processed.jpg');
    });

    it('uses imageUrl when isOverlayed is false', () => {
      const notification = createMockNotification({
        message: 'Test message',
        originalImageUrl: 'https://example.com/original.jpg',
        imageUrl: 'https://example.com/processed.jpg',
        isOverlayed: false,
      });
      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      // When isOverlayed is false, the image should be the processed one with burned-in text
      expect(
        images.some((img) => img.getAttribute('src') === 'https://example.com/processed.jpg')
      ).toBe(true);
    });

    it('falls back to originalImageUrl when isOverlayed is false but imageUrl is null', () => {
      const notification = createMockNotification({
        message: 'Test message',
        originalImageUrl: 'https://example.com/original.jpg',
        imageUrl: null,
        isOverlayed: false,
      });
      render(<NotificationBanner notifications={[notification]} />);

      const images = screen.getAllByTestId('banner-image');
      // Should fall back to originalImageUrl when imageUrl is null
      expect(
        images.some((img) => img.getAttribute('src') === 'https://example.com/original.jpg')
      ).toBe(true);
    });

    it('renders no image when both imageUrl and originalImageUrl are null', () => {
      const notification = createMockNotification({
        message: 'Test message',
        originalImageUrl: null,
        imageUrl: null,
        backgroundColor: '#123456',
        isOverlayed: true,
      });
      render(<NotificationBanner notifications={[notification]} />);

      // Preload section will not have an image, and the banner should use backgroundColor
      const images = screen.queryAllByTestId('banner-image');
      // Only preload section might have images, but with null URLs it should be empty
      expect(images.length).toBe(0);
    });
  });
});
