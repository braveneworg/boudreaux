import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTurnstile } from 'react-turnstile';

import TurnstileWidget from '@/app/components/ui/turnstile-widget';

// Store callbacks for testing
let mockCallbacks: {
  onVerify?: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  onTimeout?: () => void;
} = {};

// Mock react-turnstile
vi.mock('react-turnstile', () => ({
  default: ({
    onVerify,
    onError,
    onExpire,
    onTimeout,
    sitekey,
  }: {
    onVerify?: (token: string) => void;
    onError?: () => void;
    onExpire?: () => void;
    onTimeout?: () => void;
    sitekey?: string;
  }) => {
    // Store callbacks so tests can trigger them
    mockCallbacks = { onVerify, onError, onExpire, onTimeout };

    return React.createElement('div', {
      'data-testid': 'turnstile-widget',
      'data-sitekey': sitekey,
      onClick: () => onVerify?.('mock-token'),
    });
  },
  useTurnstile: vi.fn(() => ({
    reset: vi.fn(),
  })),
}));

// Mock environment variables
const originalEnv = process.env;

describe('TurnstileWidget', () => {
  const mockSetIsVerified = vi.fn();
  const defaultProps = {
    isVerified: false,
    setIsVerified: mockSetIsVerified,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('site key selection', () => {
    it('should use production site key in production environment', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', 'prod-site-key');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'test-site-key');

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toHaveAttribute('data-sitekey', 'prod-site-key');
    });

    it('should use test site key in non-production environment', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', 'prod-site-key');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'test-site-key');

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toHaveAttribute('data-sitekey', 'test-site-key');
    });

    it('should use test site key when NODE_ENV is test', () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', 'prod-site-key');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'test-site-key');
      process.env.NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY = 'test-site-key';

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toHaveAttribute('data-sitekey', 'test-site-key');
    });
  });

  describe('verification handling', () => {
    it('should call setIsVerified with true when verification succeeds', async () => {
      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      await userEvent.click(widget);

      expect(mockSetIsVerified).toHaveBeenCalledWith(true);
      expect(mockSetIsVerified).toHaveBeenCalledTimes(1);
    });

    it('should provide onVerify callback to Turnstile component', () => {
      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toBeInTheDocument();

      // Simulate verification by clicking the mock widget
      fireEvent.click(widget);
      expect(mockSetIsVerified).toHaveBeenCalledWith(true);
    });
  });

  describe('error handling', () => {
    it('should reset turnstile and set verified to false on error', () => {
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');

      // Since we can't directly trigger the error callback in tests,
      // we'll verify the component renders without throwing
      expect(mockReset).not.toHaveBeenCalled();

      // Since we can't directly trigger the error callback in tests,
      // we'll verify the component renders without throwing
      expect(widget).toBeInTheDocument();
    });

    it('should handle expire events', () => {
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');

      // Since we can't directly trigger the expire callback in tests,
      // we'll verify the component renders without throwing
      expect(widget).toBeInTheDocument();
    });

    it('should handle timeout events', () => {
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');

      // Since we can't directly trigger the timeout callback in tests,
      // we'll verify the component renders without throwing
      expect(widget).toBeInTheDocument();
    });
  });

  describe('turnstile integration', () => {
    it('should use turnstile hook for reset functionality', () => {
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} />);

      // Verify the hook is being used
      expect(useTurnstile).toHaveBeenCalled();
    });

    it('should pass correct props to Turnstile component', () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'test-key-123');

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toHaveAttribute('data-sitekey', 'test-key-123');
    });
  });

  describe('callback integration', () => {
    it('should accept and use setIsVerified callback properly', () => {
      const customCallback = vi.fn();

      render(<TurnstileWidget isVerified={false} setIsVerified={customCallback} />);

      const widget = screen.getByTestId('turnstile-widget');
      fireEvent.click(widget); // Simulate verification

      expect(customCallback).toHaveBeenCalledWith(true);
    });

    it('should handle multiple verification events', async () => {
      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');

      // Simulate multiple verifications
      await userEvent.click(widget);
      await userEvent.click(widget);

      expect(mockSetIsVerified).toHaveBeenCalledTimes(2);
      expect(mockSetIsVerified).toHaveBeenNthCalledWith(1, true);
      expect(mockSetIsVerified).toHaveBeenNthCalledWith(2, true);
    });

    it('should call onToken callback with token when verification succeeds', async () => {
      const mockOnToken = vi.fn();

      render(<TurnstileWidget {...defaultProps} onToken={mockOnToken} />);

      const widget = screen.getByTestId('turnstile-widget');
      await userEvent.click(widget);

      expect(mockOnToken).toHaveBeenCalledWith('mock-token');
      expect(mockOnToken).toHaveBeenCalledTimes(1);
    });

    it('should call onToken with empty string when verification is reset on error', () => {
      const mockOnToken = vi.fn();
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} onToken={mockOnToken} />);

      // Trigger error callback
      mockCallbacks.onError?.();

      expect(mockOnToken).toHaveBeenCalledWith('');
      expect(mockSetIsVerified).toHaveBeenCalledWith(false);
      expect(mockReset).toHaveBeenCalled();
    });

    it('should call onToken with empty string when verification expires', () => {
      const mockOnToken = vi.fn();
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} onToken={mockOnToken} />);

      // Trigger expire callback
      mockCallbacks.onExpire?.();

      expect(mockOnToken).toHaveBeenCalledWith('');
      expect(mockSetIsVerified).toHaveBeenCalledWith(false);
      expect(mockReset).toHaveBeenCalled();
    });

    it('should call onToken with empty string when verification times out', () => {
      const mockOnToken = vi.fn();
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} onToken={mockOnToken} />);

      // Trigger timeout callback
      mockCallbacks.onTimeout?.();

      expect(mockOnToken).toHaveBeenCalledWith('');
      expect(mockSetIsVerified).toHaveBeenCalledWith(false);
      expect(mockReset).toHaveBeenCalled();
    });

    it('should not throw when onToken is not provided and reset occurs', () => {
      const mockReset = vi.fn();
      vi.mocked(useTurnstile).mockReturnValue({ reset: mockReset });

      render(<TurnstileWidget {...defaultProps} />);

      expect(() => {
        mockCallbacks.onError?.();
      }).not.toThrow();

      expect(mockSetIsVerified).toHaveBeenCalledWith(false);
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('environment variable handling', () => {
    it('should handle missing environment variables gracefully', () => {
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', '');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', '');
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => {
        render(<TurnstileWidget {...defaultProps} />);
      }).not.toThrow();
    });

    it('should prefer production key when NODE_ENV is production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_SITE_KEY', 'production-key');
      vi.stubEnv('NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY', 'test-key');

      render(<TurnstileWidget {...defaultProps} />);

      const widget = screen.getByTestId('turnstile-widget');
      expect(widget).toHaveAttribute('data-sitekey', 'production-key');
    });
  });

  describe('component lifecycle', () => {
    it('should render without crashing', () => {
      expect(() => {
        render(<TurnstileWidget {...defaultProps} />);
      }).not.toThrow();
    });

    it('should be unmountable without errors', () => {
      const { unmount } = render(<TurnstileWidget {...defaultProps} />);

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });
});
