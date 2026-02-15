/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from './card';

describe('Card Components', () => {
  describe('Card', () => {
    it('should render the card', () => {
      render(<Card data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<Card data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toHaveAttribute('data-slot', 'card');
    });

    it('should render children', () => {
      render(<Card>Card Content</Card>);
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <Card data-testid="card" className="custom-class">
          Content
        </Card>
      );
      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      render(
        <Card data-testid="card" className="custom-class">
          Content
        </Card>
      );
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('custom-class');
    });
  });

  describe('CardHeader', () => {
    it('should render the card header', () => {
      render(<CardHeader data-testid="card-header">Header</CardHeader>);
      expect(screen.getByTestId('card-header')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardHeader data-testid="card-header">Header</CardHeader>);
      expect(screen.getByTestId('card-header')).toHaveAttribute('data-slot', 'card-header');
    });

    it('should render children', () => {
      render(<CardHeader>Header Content</CardHeader>);
      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardHeader data-testid="card-header" className="custom-class">
          Header
        </CardHeader>
      );
      expect(screen.getByTestId('card-header')).toHaveClass('custom-class');
    });
  });

  describe('CardTitle', () => {
    it('should render the card title', () => {
      render(<CardTitle data-testid="card-title">Title</CardTitle>);
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardTitle data-testid="card-title">Title</CardTitle>);
      expect(screen.getByTestId('card-title')).toHaveAttribute('data-slot', 'card-title');
    });

    it('should render children', () => {
      render(<CardTitle>My Title</CardTitle>);
      expect(screen.getByText('My Title')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardTitle data-testid="card-title" className="custom-class">
          Title
        </CardTitle>
      );
      expect(screen.getByTestId('card-title')).toHaveClass('custom-class');
    });

    it('should have font-semibold class by default', () => {
      render(<CardTitle data-testid="card-title">Title</CardTitle>);
      expect(screen.getByTestId('card-title')).toHaveClass('font-semibold');
    });
  });

  describe('CardDescription', () => {
    it('should render the card description', () => {
      render(<CardDescription data-testid="card-description">Description</CardDescription>);
      expect(screen.getByTestId('card-description')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardDescription data-testid="card-description">Description</CardDescription>);
      expect(screen.getByTestId('card-description')).toHaveAttribute(
        'data-slot',
        'card-description'
      );
    });

    it('should render children', () => {
      render(<CardDescription>My Description</CardDescription>);
      expect(screen.getByText('My Description')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardDescription data-testid="card-description" className="custom-class">
          Description
        </CardDescription>
      );
      expect(screen.getByTestId('card-description')).toHaveClass('custom-class');
    });
  });

  describe('CardAction', () => {
    it('should render the card action', () => {
      render(<CardAction data-testid="card-action">Action</CardAction>);
      expect(screen.getByTestId('card-action')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardAction data-testid="card-action">Action</CardAction>);
      expect(screen.getByTestId('card-action')).toHaveAttribute('data-slot', 'card-action');
    });

    it('should render children', () => {
      render(<CardAction>Action Button</CardAction>);
      expect(screen.getByText('Action Button')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardAction data-testid="card-action" className="custom-class">
          Action
        </CardAction>
      );
      expect(screen.getByTestId('card-action')).toHaveClass('custom-class');
    });
  });

  describe('CardContent', () => {
    it('should render the card content', () => {
      render(<CardContent data-testid="card-content">Content</CardContent>);
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardContent data-testid="card-content">Content</CardContent>);
      expect(screen.getByTestId('card-content')).toHaveAttribute('data-slot', 'card-content');
    });

    it('should render children', () => {
      render(<CardContent>Main Content</CardContent>);
      expect(screen.getByText('Main Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardContent data-testid="card-content" className="custom-class">
          Content
        </CardContent>
      );
      expect(screen.getByTestId('card-content')).toHaveClass('custom-class');
    });
  });

  describe('CardFooter', () => {
    it('should render the card footer', () => {
      render(<CardFooter data-testid="card-footer">Footer</CardFooter>);
      expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<CardFooter data-testid="card-footer">Footer</CardFooter>);
      expect(screen.getByTestId('card-footer')).toHaveAttribute('data-slot', 'card-footer');
    });

    it('should render children', () => {
      render(<CardFooter>Footer Content</CardFooter>);
      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <CardFooter data-testid="card-footer" className="custom-class">
          Footer
        </CardFooter>
      );
      expect(screen.getByTestId('card-footer')).toHaveClass('custom-class');
    });
  });

  describe('Full Card composition', () => {
    it('should render a complete card with all parts', () => {
      render(
        <Card data-testid="card">
          <CardHeader data-testid="card-header">
            <CardTitle data-testid="card-title">Card Title</CardTitle>
            <CardDescription data-testid="card-description">Card Description</CardDescription>
            <CardAction data-testid="card-action">Action</CardAction>
          </CardHeader>
          <CardContent data-testid="card-content">Content goes here</CardContent>
          <CardFooter data-testid="card-footer">Footer content</CardFooter>
        </Card>
      );

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-header')).toBeInTheDocument();
      expect(screen.getByTestId('card-title')).toBeInTheDocument();
      expect(screen.getByTestId('card-description')).toBeInTheDocument();
      expect(screen.getByTestId('card-action')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
      expect(screen.getByTestId('card-footer')).toBeInTheDocument();
    });
  });
});
