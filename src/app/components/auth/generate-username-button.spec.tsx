import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { GenerateUsernameButton } from './generate-username-button';
import type { UseFormReturn } from 'react-hook-form';

// Mock unique-username-generator
const mockGenerateUsername = vi.fn();
vi.mock('unique-username-generator', () => ({
  generateUsername: () => mockGenerateUsername(),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  RefreshCwIcon: ({ className, ...props }: { className?: string }) => (
    <svg data-testid="refresh-icon" className={className} aria-hidden="true" {...props}>
      RefreshIcon
    </svg>
  ),
}));

// Mock Button component
vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    type,
    variant,
    className,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    variant?: string;
    className?: string;
    'aria-label'?: string;
  }) => (
    <button
      onClick={onClick}
      type={type}
      data-variant={variant}
      className={className}
      data-testid="generate-button"
      aria-label={ariaLabel}
    >
      {children}
    </button>
  ),
}));

interface MockFormData {
  username: string;
  confirmUsername: string;
}

describe('GenerateUsernameButton', () => {
  let mockForm: UseFormReturn<MockFormData>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock form object
    mockForm = {
      setValue: vi.fn(),
      getValues: vi.fn((field?: string | string[]) => {
        if (field === 'username') return 'existing-username';
        if (field === 'confirmUsername') return 'existing-username';
        if (Array.isArray(field)) return ['existing-username', 'existing-username'];
        if (!field) return { username: 'existing-username', confirmUsername: 'existing-username' };
        return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      trigger: vi.fn().mockResolvedValue(true),
    } as unknown as UseFormReturn<MockFormData>;

    // Set default mock return value
    mockGenerateUsername.mockReturnValue('generated-username-1234');
  });

  describe('rendering', () => {
    it('should render the button with correct text', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Generate random username');
    });

    it('should render with link variant', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      expect(button).toHaveAttribute('data-variant', 'link');
    });

    it('should render with correct type', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('should render the refresh icon', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const icon = screen.getByTestId('refresh-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('size-4');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply correct CSS classes', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      expect(button).toHaveClass('mt-2', 'flex', 'items-center', 'gap-2');
    });

    it('should have proper aria-label for accessibility', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      expect(button).toHaveAttribute('aria-label', 'Generate random username');
    });
  });

  describe('username generation', () => {
    it('should generate a random username when clicked', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      expect(mockGenerateUsername).toHaveBeenCalledTimes(1);
    });

    it('should set both username and confirmUsername fields with generated value', async () => {
      const user = userEvent.setup();
      const generatedUsername = 'test-user-5678';
      mockGenerateUsername.mockReturnValue(generatedUsername);

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith('username', generatedUsername, {
          shouldValidate: true,
          shouldDirty: true,
        });
        expect(mockForm.setValue).toHaveBeenCalledWith('confirmUsername', generatedUsername, {
          shouldValidate: true,
          shouldDirty: true,
        });
      });
    });

    it('should trigger validation after setting values', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      await waitFor(() => {
        expect(mockForm.trigger).toHaveBeenCalledWith(['username', 'confirmUsername']);
      });
    });

    it('should call setValue with correct options', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            shouldValidate: true,
            shouldDirty: true,
          })
        );
      });
    });

    it('should generate different usernames on multiple clicks', async () => {
      const user = userEvent.setup();
      mockGenerateUsername
        .mockReturnValueOnce('username-1111')
        .mockReturnValueOnce('username-2222')
        .mockReturnValueOnce('username-3333');

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');

      await user.click(button);
      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith(
          'username',
          'username-1111',
          expect.any(Object)
        );
      });

      await user.click(button);
      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith(
          'username',
          'username-2222',
          expect.any(Object)
        );
      });

      await user.click(button);
      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith(
          'username',
          'username-3333',
          expect.any(Object)
        );
      });

      expect(mockGenerateUsername).toHaveBeenCalledTimes(3);
    });
  });

  describe('confirmUsername clearing behavior', () => {
    it('should clear confirmUsername when usernames do not match on mount', () => {
      mockForm.getValues = vi.fn((field?: string | string[]) => {
        if (field === 'username') return 'username1';
        if (field === 'confirmUsername') return 'username2';
        if (Array.isArray(field)) return ['username1', 'username2'];
        if (!field) return { username: 'username1', confirmUsername: 'username2' };
        return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      expect(mockForm.setValue).toHaveBeenCalledWith('confirmUsername', '', {
        shouldValidate: false,
        shouldDirty: false,
      });
    });

    it('should not clear confirmUsername when usernames match', () => {
      mockForm.getValues = vi.fn((field?: string | string[]) => {
        if (field === 'username') return 'matching-username';
        if (field === 'confirmUsername') return 'matching-username';
        if (Array.isArray(field)) return ['matching-username', 'matching-username'];
        if (!field) return { username: 'matching-username', confirmUsername: 'matching-username' };
        return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      expect(mockForm.setValue).not.toHaveBeenCalledWith('confirmUsername', '', expect.any(Object));
    });

    it('should only clear confirmUsername once', () => {
      mockForm.getValues = vi.fn((field?: string | string[]) => {
        if (field === 'username') return 'username1';
        if (field === 'confirmUsername') return 'username2';
        if (Array.isArray(field)) return ['username1', 'username2'];
        if (!field) return { username: 'username1', confirmUsername: 'username2' };
        return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      const { rerender } = render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      expect(mockForm.setValue).toHaveBeenCalledTimes(1);

      // Rerender the component
      rerender(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      // Should still only be called once
      expect(mockForm.setValue).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');

      // Focus the button
      button.focus();
      expect(button).toHaveFocus();

      // Press Enter
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockGenerateUsername).toHaveBeenCalled();
      });
    });

    it('should be clickable with mouse', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      expect(mockGenerateUsername).toHaveBeenCalled();
    });

    it('should have accessible button label', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByLabelText('Generate random username');
      expect(button).toBeInTheDocument();
    });

    it('should hide decorative icon from screen readers', () => {
      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const icon = screen.getByTestId('refresh-icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('edge cases', () => {
    it('should handle empty initial values', () => {
      mockForm.getValues = vi.fn((field?: string | string[]) => {
        if (Array.isArray(field)) return ['', ''];
        if (!field) return { username: '', confirmUsername: '' };
        return '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      // Should not clear empty values
      expect(mockForm.setValue).not.toHaveBeenCalled();
    });

    it('should handle rapid clicks gracefully', async () => {
      const user = userEvent.setup();
      mockGenerateUsername
        .mockReturnValueOnce('username-1')
        .mockReturnValueOnce('username-2')
        .mockReturnValueOnce('username-3');

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');

      // Rapid clicks
      await user.click(button);
      await user.click(button);
      await user.click(button);

      expect(mockGenerateUsername).toHaveBeenCalledTimes(3);
      expect(mockForm.setValue).toHaveBeenCalled();
    });
  });
});
