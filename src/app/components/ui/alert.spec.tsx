/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert', () => {
  describe('Alert root', () => {
    it('renders', () => {
      render(<Alert>Alert content</Alert>);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(<Alert data-testid="alert">Alert content</Alert>);

      expect(screen.getByTestId('alert')).toHaveAttribute('data-slot', 'alert');
    });

    it('has role="alert"', () => {
      render(<Alert>Alert content</Alert>);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(<Alert className="custom-alert">Alert content</Alert>);

      expect(screen.getByRole('alert')).toHaveClass('custom-alert');
    });

    it('renders children', () => {
      render(<Alert>Alert message</Alert>);

      expect(screen.getByText('Alert message')).toBeInTheDocument();
    });

    describe('variants', () => {
      it('renders default variant', () => {
        render(<Alert data-testid="alert">Default alert</Alert>);

        expect(screen.getByTestId('alert')).toHaveClass('bg-green-100');
      });

      it('renders destructive variant', () => {
        render(
          <Alert variant="destructive" data-testid="alert">
            Error alert
          </Alert>
        );

        expect(screen.getByTestId('alert')).toHaveClass('text-destructive');
      });
    });
  });

  describe('AlertTitle', () => {
    it('renders', () => {
      render(
        <Alert>
          <AlertTitle>Alert Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByText('Alert Title')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Alert>
          <AlertTitle data-testid="title">Alert Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'alert-title');
    });

    it('applies custom className', () => {
      render(
        <Alert>
          <AlertTitle data-testid="title" className="custom-title">
            Alert Title
          </AlertTitle>
        </Alert>
      );

      expect(screen.getByTestId('title')).toHaveClass('custom-title');
    });
  });

  describe('AlertDescription', () => {
    it('renders', () => {
      render(
        <Alert>
          <AlertDescription>Alert description text</AlertDescription>
        </Alert>
      );

      expect(screen.getByText('Alert description text')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Alert>
          <AlertDescription data-testid="description">Description</AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('description')).toHaveAttribute('data-slot', 'alert-description');
    });

    it('applies custom className', () => {
      render(
        <Alert>
          <AlertDescription data-testid="description" className="custom-description">
            Description
          </AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('description')).toHaveClass('custom-description');
    });
  });

  describe('integration', () => {
    it('renders complete alert with icon, title, and description', () => {
      render(
        <Alert>
          <AlertCircle data-testid="icon" />
          <AlertTitle>Heads up!</AlertTitle>
          <AlertDescription>You can add components to your app.</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Heads up!')).toBeInTheDocument();
      expect(screen.getByText('You can add components to your app.')).toBeInTheDocument();
    });

    it('renders destructive alert', () => {
      render(
        <Alert variant="destructive" data-testid="alert">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong.</AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('alert')).toHaveClass('text-destructive');
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });
  });
});
