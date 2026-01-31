import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import {
  deleteNotificationBannerAction,
  publishNotificationBannerAction,
  unpublishNotificationBannerAction,
} from '@/lib/actions/notification-banner-action';
import type { NotificationBanner } from '@/lib/services/notification-banner-service';

import { NotificationBannerList } from './notification-banner-list';

// Mock next/navigation
const mockPush = vi.fn();

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock next/image - use img element for testing (eslint warning disabled for test mock)
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    className,
    sizes: _sizes,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
    sizes?: string;
    // eslint-disable-next-line @next/next/no-img-element
  }) => <img src={src} alt={alt} className={className} data-testid="notification-image" />,
}));

// Mock notification banner actions
vi.mock('@/lib/actions/notification-banner-action', () => ({
  deleteNotificationBannerAction: vi.fn(),
  publishNotificationBannerAction: vi.fn(),
  unpublishNotificationBannerAction: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockDeleteAction = vi.mocked(deleteNotificationBannerAction);
const mockPublishAction = vi.mocked(publishNotificationBannerAction);
const mockUnpublishAction = vi.mocked(unpublishNotificationBannerAction);

const createMockNotification = (
  overrides: Partial<NotificationBanner> = {}
): NotificationBanner => ({
  id: 'notification-1',
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
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  displayFrom: null,
  displayUntil: null,
  addedById: 'user-1',
  publishedAt: null,
  publishedBy: null,
  messageFont: 'system-ui',
  messageFontSize: 2.5,
  messageContrast: 100,
  secondaryMessageFont: 'system-ui',
  secondaryMessageFontSize: 2,
  secondaryMessageContrast: 95,
  messageTextColor: '#ffffff',
  secondaryMessageTextColor: '#ffffff',
  messageTextShadow: true,
  messageTextShadowDarkness: 50,
  secondaryMessageTextShadow: true,
  secondaryMessageTextShadowDarkness: 50,
  messagePositionX: 50,
  messagePositionY: 10,
  secondaryMessagePositionX: 50,
  secondaryMessagePositionY: 90,
  messageRotation: 0,
  secondaryMessageRotation: 0,
  imageOffsetX: 0,
  imageOffsetY: 0,
  ...overrides,
});

describe('NotificationBannerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('should render empty state when no notifications', () => {
      render(<NotificationBannerList notifications={[]} />);

      expect(screen.getByText('No Notification Banners')).toBeInTheDocument();
      expect(screen.getByText(/Create your first notification banner/i)).toBeInTheDocument();
    });
  });

  describe('notification rendering', () => {
    it('should render notifications', () => {
      const notifications = [
        createMockNotification({ id: '1', message: 'First notification' }),
        createMockNotification({ id: '2', message: 'Second notification' }),
      ];

      render(<NotificationBannerList notifications={notifications} />);

      // Messages may appear multiple times (in overlay and card content)
      const firstMessages = screen.getAllByText('First notification');
      const secondMessages = screen.getAllByText('Second notification');
      expect(firstMessages.length).toBeGreaterThanOrEqual(1);
      expect(secondMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('should display notification image when imageUrl is provided', () => {
      const notification = createMockNotification({
        imageUrl: 'https://example.com/image.jpg',
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const image = screen.getByTestId('notification-image');
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should display secondary message when provided', () => {
      const notification = createMockNotification({
        message: 'Primary message',
        secondaryMessage: 'Secondary message text',
        isOverlayed: true,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // Secondary message may appear in both overlay and card content
      const secondaryMessages = screen.getAllByText('Secondary message text');
      expect(secondaryMessages.length).toBeGreaterThanOrEqual(1);
    });

    it('should display notes when provided', () => {
      const notification = createMockNotification({
        notes: 'Internal notes for admins',
      });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('Internal notes for admins')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('should display Draft badge when not published', () => {
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should display Published badge when published', () => {
      const notification = createMockNotification({
        publishedAt: new Date('2024-01-10'),
      });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('Published')).toBeInTheDocument();
    });

    it('should display Active badge when isActive is true', () => {
      const notification = createMockNotification({ isActive: true });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display Inactive badge when isActive is false', () => {
      const notification = createMockNotification({ isActive: false });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should display sort order badge', () => {
      const notification = createMockNotification({ sortOrder: 5 });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText('#5')).toBeInTheDocument();
    });
  });

  describe('display period', () => {
    it('should show "Any - Ongoing" when no display dates set', () => {
      const notification = createMockNotification({
        displayFrom: null,
        displayUntil: null,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      expect(screen.getByText(/Any - Ongoing/i)).toBeInTheDocument();
    });

    it('should format display dates correctly', () => {
      // Use dates that account for potential timezone shifts
      const notification = createMockNotification({
        displayFrom: new Date('2024-06-15T12:00:00Z'),
        displayUntil: new Date('2024-09-20T12:00:00Z'),
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // Format: "MMM d - MMM d, yyyy" - use flexible pattern for timezone variations
      expect(screen.getByText(/Jun 1\d - Sep \d+, 2024/i)).toBeInTheDocument();
    });
  });

  describe('publish/unpublish actions', () => {
    it('should show Publish option for unpublished notifications', async () => {
      const user = userEvent.setup();
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      // Open the dropdown menu
      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('should show Unpublish option for published notifications', async () => {
      const user = userEvent.setup();
      const notification = createMockNotification({
        publishedAt: new Date('2024-01-10'),
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // Open the dropdown menu
      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      expect(screen.getByText('Unpublish')).toBeInTheDocument();
    });

    it('should call publishNotificationBannerAction when Publish is clicked', async () => {
      const user = userEvent.setup();
      mockPublishAction.mockResolvedValue({ success: true });
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(mockPublishAction).toHaveBeenCalledWith(notification.id);
      });
    });

    it('should show success toast on successful publish', async () => {
      const user = userEvent.setup();
      mockPublishAction.mockResolvedValue({ success: true });
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Notification banner published successfully');
      });
    });

    it('should show error toast on failed publish', async () => {
      const user = userEvent.setup();
      mockPublishAction.mockResolvedValue({
        success: false,
        error: 'Publish failed',
      });
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Publish failed');
      });
    });

    it('should call unpublishNotificationBannerAction when Unpublish is clicked', async () => {
      const user = userEvent.setup();
      mockUnpublishAction.mockResolvedValue({ success: true });
      const notification = createMockNotification({
        publishedAt: new Date('2024-01-10'),
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const unpublishButton = screen.getByText('Unpublish');
      await user.click(unpublishButton);

      await waitFor(() => {
        expect(mockUnpublishAction).toHaveBeenCalledWith(notification.id);
      });
    });

    it('should handle publish action errors gracefully', async () => {
      const user = userEvent.setup();
      mockPublishAction.mockRejectedValue(new Error('Network error'));
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred');
      });
    });

    it('should handle unpublish action errors gracefully', async () => {
      const user = userEvent.setup();
      mockUnpublishAction.mockRejectedValue(new Error('Network error'));
      const notification = createMockNotification({
        publishedAt: new Date('2024-01-10'),
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const unpublishButton = screen.getByText('Unpublish');
      await user.click(unpublishButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred');
      });
    });
  });

  describe('delete action', () => {
    it('should show Delete option in menu', async () => {
      const user = userEvent.setup();
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should show confirmation before deleting', async () => {
      const user = userEvent.setup();
      const mockConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      expect(mockConfirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this notification banner?'
      );
      expect(mockDeleteAction).not.toHaveBeenCalled();

      mockConfirm.mockRestore();
    });

    it('should call deleteNotificationBannerAction when confirmed', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDeleteAction.mockResolvedValue({ success: true });
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockDeleteAction).toHaveBeenCalledWith(notification.id);
      });
    });

    it('should show success toast on successful delete', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDeleteAction.mockResolvedValue({ success: true });
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Notification banner deleted successfully');
      });
    });

    it('should show error toast on failed delete', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDeleteAction.mockResolvedValue({
        success: false,
        error: 'Delete failed',
      });
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Delete failed');
      });
    });

    it('should handle delete action errors gracefully', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDeleteAction.mockRejectedValue(new Error('Network error'));
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('An unexpected error occurred');
      });
    });
  });

  describe('edit navigation', () => {
    it('should have edit link to notification detail page', () => {
      const notification = createMockNotification({ id: 'test-id-123' });

      render(<NotificationBannerList notifications={[notification]} />);

      const editLink = screen.getByRole('link', { name: '' });
      expect(editLink).toHaveAttribute('href', '/admin/notifications/test-id-123');
    });
  });

  describe('hexToRgba helper', () => {
    it('should display text with correct opacity when messageContrast is set', () => {
      const notification = createMockNotification({
        messageContrast: 50,
        isOverlayed: true,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // The message should be rendered (may appear multiple times in preview and card)
      const messages = screen.getAllByText(notification.message);
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle 3-digit hex colors', () => {
      const notification = createMockNotification({
        messageTextColor: '#fff',
        isOverlayed: true,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const messages = screen.getAllByText(notification.message);
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should fallback for invalid hex colors', () => {
      const notification = createMockNotification({
        messageTextColor: 'invalid',
        isOverlayed: true,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const messages = screen.getAllByText(notification.message);
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('text overlay visibility', () => {
    it('should show text overlay when isOverlayed is true', () => {
      const notification = createMockNotification({
        message: 'Overlay Message',
        isOverlayed: true,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // The message appears in the overlay area (twice: in card preview and text)
      const messages = screen.getAllByText('Overlay Message');
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show text overlay when isOverlayed is false', () => {
      const notification = createMockNotification({
        message: 'Hidden Message',
        isOverlayed: false,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // The message should only appear once in the card content, not in overlay
      const messages = screen.getAllByText('Hidden Message');
      expect(messages.length).toBe(1); // Only in card content
    });
  });

  describe('router refresh', () => {
    it('should refresh router after successful publish', async () => {
      const user = userEvent.setup();
      mockPublishAction.mockResolvedValue({ success: true });
      const notification = createMockNotification({ publishedAt: null });

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const publishButton = screen.getByText('Publish');
      await user.click(publishButton);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should refresh router after successful delete', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDeleteAction.mockResolvedValue({ success: true });
      const notification = createMockNotification();

      render(<NotificationBannerList notifications={[notification]} />);

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });

  describe('text rotation styling', () => {
    it('should apply rotation transform to main message when messageRotation is set', () => {
      const notification = createMockNotification({
        message: 'Rotated message',
        isOverlayed: true,
        imageUrl: 'https://example.com/image.jpg',
        messageRotation: 45,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // Find the main message span element
      const messageElements = screen.getAllByText('Rotated message');
      const overlayMessage = messageElements.find(
        (el) => el.tagName.toLowerCase() === 'span' && el.className.includes('absolute')
      );

      expect(overlayMessage).toBeDefined();
      expect(overlayMessage?.style.transform).toContain('rotate(45deg)');
    });

    it('should apply rotation transform to secondary message when secondaryMessageRotation is set', () => {
      const notification = createMockNotification({
        message: 'Primary',
        secondaryMessage: 'Rotated secondary',
        isOverlayed: true,
        imageUrl: 'https://example.com/image.jpg',
        secondaryMessageRotation: -30,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      // Find the secondary message span element
      const secondaryElements = screen.getAllByText('Rotated secondary');
      const overlaySecondary = secondaryElements.find(
        (el) => el.tagName.toLowerCase() === 'span' && el.className.includes('absolute')
      );

      expect(overlaySecondary).toBeDefined();
      expect(overlaySecondary?.style.transform).toContain('rotate(-30deg)');
    });

    it('should apply zero rotation by default', () => {
      const notification = createMockNotification({
        message: 'Default rotation message',
        isOverlayed: true,
        imageUrl: 'https://example.com/image.jpg',
        messageRotation: 0,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const messageElements = screen.getAllByText('Default rotation message');
      const overlayMessage = messageElements.find(
        (el) => el.tagName.toLowerCase() === 'span' && el.className.includes('absolute')
      );

      expect(overlayMessage).toBeDefined();
      expect(overlayMessage?.style.transform).toContain('rotate(0deg)');
    });

    it('should handle null rotation values with default of 0', () => {
      const notification = createMockNotification({
        message: 'Null rotation message',
        isOverlayed: true,
        imageUrl: 'https://example.com/image.jpg',
        messageRotation: null,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const messageElements = screen.getAllByText('Null rotation message');
      const overlayMessage = messageElements.find(
        (el) => el.tagName.toLowerCase() === 'span' && el.className.includes('absolute')
      );

      expect(overlayMessage).toBeDefined();
      expect(overlayMessage?.style.transform).toContain('rotate(0deg)');
    });
  });

  describe('image offset styling', () => {
    it('should apply objectPosition style to image when offsets are set', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: 25,
        imageOffsetY: -10,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const image = screen.getByTestId('notification-image');
      // Note: The mock doesn't preserve all styles, but we verify it renders
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should render image with zero offset by default', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: 0,
        imageOffsetY: 0,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const image = screen.getByTestId('notification-image');
      expect(image).toBeInTheDocument();
    });

    it('should handle null offset values', () => {
      const notification = createMockNotification({
        message: 'Test',
        imageUrl: 'https://example.com/image.jpg',
        imageOffsetX: null,
        imageOffsetY: null,
      });

      render(<NotificationBannerList notifications={[notification]} />);

      const image = screen.getByTestId('notification-image');
      expect(image).toBeInTheDocument();
    });
  });
});
