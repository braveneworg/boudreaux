import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HoverCard, HoverCardTrigger, HoverCardContent } from './hover-card';

describe('HoverCard', () => {
  const renderHoverCard = () => {
    return render(
      <HoverCard>
        <HoverCardTrigger asChild>
          <button>Hover me</button>
        </HoverCardTrigger>
        <HoverCardContent>
          <div data-testid="content">Hover content</div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  describe('HoverCard root', () => {
    it('renders trigger', () => {
      renderHoverCard();

      expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument();
    });
  });

  describe('HoverCardTrigger', () => {
    it('has data-slot attribute', () => {
      render(
        <HoverCard>
          <HoverCardTrigger data-testid="trigger">Trigger</HoverCardTrigger>
          <HoverCardContent>Content</HoverCardContent>
        </HoverCard>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'hover-card-trigger');
    });

    it('renders children', () => {
      render(
        <HoverCard>
          <HoverCardTrigger>Custom Trigger Text</HoverCardTrigger>
          <HoverCardContent>Content</HoverCardContent>
        </HoverCard>
      );

      expect(screen.getByText('Custom Trigger Text')).toBeInTheDocument();
    });
  });

  describe('HoverCardContent', () => {
    it('shows content on hover', async () => {
      const user = userEvent.setup();
      renderHoverCard();

      const trigger = screen.getByRole('button', { name: 'Hover me' });
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });
    });

    it('hides content when not hovering', async () => {
      const user = userEvent.setup();
      renderHoverCard();

      const trigger = screen.getByRole('button', { name: 'Hover me' });
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });

      await user.unhover(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();
      render(
        <HoverCard>
          <HoverCardTrigger asChild>
            <button>Hover</button>
          </HoverCardTrigger>
          <HoverCardContent className="custom-content" data-testid="hover-content">
            Content
          </HoverCardContent>
        </HoverCard>
      );

      await user.hover(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByTestId('hover-content')).toHaveClass('custom-content');
      });
    });
  });

  describe('open state', () => {
    it('supports controlled open state', async () => {
      render(
        <HoverCard open>
          <HoverCardTrigger>Trigger</HoverCardTrigger>
          <HoverCardContent data-testid="content">Content</HoverCardContent>
        </HoverCard>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('supports onOpenChange callback', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();

      render(
        <HoverCard onOpenChange={onOpenChange}>
          <HoverCardTrigger asChild>
            <button>Hover</button>
          </HoverCardTrigger>
          <HoverCardContent>Content</HoverCardContent>
        </HoverCard>
      );

      await user.hover(screen.getByRole('button'));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });
});
