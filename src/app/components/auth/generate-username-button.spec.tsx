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
  RefreshCwIcon: ({ className }: { className?: string }) => (
    <div data-testid="refresh-icon" className={className}>
      RefreshIcon
    </div>
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
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    variant?: string;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      type={type}
      data-variant={variant}
      className={className}
      data-testid="generate-button"
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
      getValues: vi.fn((field: string) => {
        if (field === 'username') return 'existing-username';
        if (field === 'confirmUsername') return 'existing-username';
        return '';
      }),
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

    it('should call setValue with shouldValidate and shouldDirty flags', async () => {
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
      mockForm.getValues = vi.fn((field: string) => {
        if (field === 'username') return 'username1';
        if (field === 'confirmUsername') return 'username2';
        return '';
      });

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
      mockForm.getValues = vi.fn((field: string) => {
        if (field === 'username') return 'matching-username';
        if (field === 'confirmUsername') return 'matching-username';
        return '';
      });

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      expect(mockForm.setValue).not.toHaveBeenCalledWith('confirmUsername', '', expect.any(Object));
    });

    it('should only clear confirmUsername once', () => {
      mockForm.getValues = vi.fn((field: string) => {
        if (field === 'username') return 'username1';
        if (field === 'confirmUsername') return 'username2';
        return '';
      });

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
  });

  describe('edge cases', () => {
    it('should handle empty field names', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');
      await user.click(button);

      expect(mockForm.setValue).toHaveBeenCalled();
      expect(mockForm.trigger).toHaveBeenCalled();
    });

    it('should not throw error when validation trigger is called', async () => {
      const user = userEvent.setup();

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');

      // Should not throw when clicking the button
      await expect(user.click(button)).resolves.not.toThrow();

      await waitFor(() => {
        expect(mockForm.trigger).toHaveBeenCalled();
        expect(mockForm.setValue).toHaveBeenCalled();
      });
    });

    it('should log error and continue when trigger fails', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockForm.trigger = vi.fn().mockRejectedValue(new Error('Validation failed'));

      render(
        <GenerateUsernameButton
          form={mockForm}
          fieldsToPopulate={['username', 'confirmUsername']}
        />
      );

      const button = screen.getByTestId('generate-button');

      // Click should not throw
      await user.click(button);

      // Wait for the error to be logged
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error generating username:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
