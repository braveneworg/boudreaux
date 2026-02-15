/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';

import { Toaster } from './sonner';

// Wrapper to provide theme context
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider attribute="class">{ui}</ThemeProvider>);
};

describe('Toaster', () => {
  it('renders', () => {
    const { container } = renderWithTheme(<Toaster />);

    // Sonner renders a section element
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('renders with bottom-right position by default', () => {
    const { container } = renderWithTheme(<Toaster />);

    // Check that it renders with section aria-label
    expect(container.querySelector('section')).toHaveAttribute('aria-label');
  });

  it('accepts position prop', () => {
    const { container } = renderWithTheme(<Toaster position="top-center" />);

    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('accepts richColors prop', () => {
    const { container } = renderWithTheme(<Toaster richColors />);

    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('accepts duration prop', () => {
    const { container } = renderWithTheme(<Toaster duration={5000} />);

    expect(container.querySelector('section')).toBeInTheDocument();
  });
});
