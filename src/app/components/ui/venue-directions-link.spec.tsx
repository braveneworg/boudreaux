/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VenueDirectionsLink } from './venue-directions-link';

describe('VenueDirectionsLink', () => {
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it('should render children inside a link', () => {
    render(
      <VenueDirectionsLink destination="123 Main St, Austin TX">Get Directions</VenueDirectionsLink>
    );

    expect(screen.getByText('Get Directions')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('should have a Google Maps fallback href for SSR', () => {
    render(<VenueDirectionsLink destination="123 Main St">Directions</VenueDirectionsLink>);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('google.com/maps/dir');
    expect(link.getAttribute('href')).toContain(encodeURIComponent('123 Main St'));
  });

  it('should open Google Maps on click for desktop browsers', async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true,
    });

    render(
      <VenueDirectionsLink destination="The Mohawk, Austin TX">Directions</VenueDirectionsLink>
    );

    await user.click(screen.getByRole('link'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps/dir'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should open Apple Maps on iOS devices', async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    });

    render(
      <VenueDirectionsLink destination="The Mohawk, Austin TX">Directions</VenueDirectionsLink>
    );

    await user.click(screen.getByRole('link'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('maps.apple.com'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should open Google Maps on Android devices', async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      configurable: true,
    });

    render(
      <VenueDirectionsLink destination="The Mohawk, Austin TX">Directions</VenueDirectionsLink>
    );

    await user.click(screen.getByRole('link'));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/maps/dir'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('should apply custom className', () => {
    render(
      <VenueDirectionsLink destination="Austin TX" className="text-blue-500">
        Directions
      </VenueDirectionsLink>
    );

    expect(screen.getByRole('link')).toHaveClass('text-blue-500');
  });
});
