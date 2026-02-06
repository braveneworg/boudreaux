import { render, screen } from '@testing-library/react';

import { Avatar, AvatarImage, AvatarFallback } from './avatar';

describe('Avatar', () => {
  describe('Avatar root', () => {
    it('renders', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toHaveAttribute('data-slot', 'avatar');
    });

    it('applies custom className', () => {
      render(
        <Avatar data-testid="avatar" className="custom-avatar">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toHaveClass('custom-avatar');
    });

    it('has default rounded-full class', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toHaveClass('rounded-full');
    });

    it('passes additional props', () => {
      render(
        <Avatar data-testid="avatar" aria-label="User avatar">
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toHaveAttribute('aria-label', 'User avatar');
    });
  });

  describe('AvatarImage', () => {
    // Note: Radix AvatarImage only renders when src is provided and can load
    // Testing basic component export - AvatarImage only renders after image loads
    // so we only test that it can be imported
    it('can be imported', () => {
      expect(AvatarImage).toBeDefined();
      expect(typeof AvatarImage).toBe('function');
    });
  });

  describe('AvatarFallback', () => {
    it('renders fallback content', () => {
      render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Avatar>
          <AvatarFallback data-testid="fallback">JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('fallback')).toHaveAttribute('data-slot', 'avatar-fallback');
    });

    it('applies custom className', () => {
      render(
        <Avatar>
          <AvatarFallback data-testid="fallback" className="custom-fallback">
            JD
          </AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('fallback')).toHaveClass('custom-fallback');
    });

    it('has default background class', () => {
      render(
        <Avatar>
          <AvatarFallback data-testid="fallback">JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('fallback')).toHaveClass('bg-muted');
    });

    it('renders with icon as fallback', () => {
      render(
        <Avatar>
          <AvatarFallback data-testid="fallback">
            <svg data-testid="icon" />
          </AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
  });

  describe('integration', () => {
    it('renders avatar with fallback', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback data-testid="fallback">JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByTestId('avatar')).toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });

    it('shows fallback when no image', () => {
      render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });
});
