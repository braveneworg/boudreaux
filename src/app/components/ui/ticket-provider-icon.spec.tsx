/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { BandsintownIcon } from '@/app/components/icons/ticket-providers';
import { getTicketProvider } from '@/lib/utils/ticket-provider';

import { TicketProviderIcon } from './ticket-provider-icon';

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: vi.fn(({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />),
}));

vi.mock('@/lib/utils/ticket-provider', () => ({
  getTicketProvider: vi.fn(),
}));

vi.mock('@/app/components/icons/ticket-providers', () => ({
  BandsintownIcon: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="bandsintown-icon" className={className} />
  )),
  EventbriteIcon: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="eventbrite-icon" className={className} />
  )),
  StubhubIcon: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="stubhub-icon" className={className} />
  )),
  TicketmasterIcon: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="ticketmaster-icon" className={className} />
  )),
}));

describe('TicketProviderIcon', () => {
  beforeEach(() => {
    vi.mocked(getTicketProvider).mockReturnValue(null);
  });

  it('renders a next/image element when ticketIconUrl is provided', () => {
    render(
      <TicketProviderIcon
        ticketsUrl="https://example.com"
        ticketIconUrl="https://cdn.example.com/icon.png"
      />
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/icon.png');
    expect(img).toHaveAttribute('alt', 'Ticket provider');
  });

  it('does not call getTicketProvider when ticketIconUrl is provided', () => {
    render(
      <TicketProviderIcon
        ticketsUrl="https://www.bandsintown.com/e/123"
        ticketIconUrl="https://cdn.example.com/icon.png"
      />
    );

    expect(getTicketProvider).not.toHaveBeenCalled();
  });

  it('returns null when no URL and no provider matches', () => {
    vi.mocked(getTicketProvider).mockReturnValue(null);

    const { container } = render(<TicketProviderIcon ticketsUrl="https://unknown.com" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders BandsintownIcon for a bandsintown URL', () => {
    vi.mocked(getTicketProvider).mockReturnValue('bandsintown');

    render(<TicketProviderIcon ticketsUrl="https://www.bandsintown.com/e/123" />);

    expect(screen.getByTestId('bandsintown-icon')).toBeInTheDocument();
  });

  it('renders EventbriteIcon for an eventbrite URL', () => {
    vi.mocked(getTicketProvider).mockReturnValue('eventbrite');

    render(<TicketProviderIcon ticketsUrl="https://www.eventbrite.com/e/my-event" />);

    expect(screen.getByTestId('eventbrite-icon')).toBeInTheDocument();
  });

  it('renders StubhubIcon for a stubhub URL', () => {
    vi.mocked(getTicketProvider).mockReturnValue('stubhub');

    render(<TicketProviderIcon ticketsUrl="https://www.stubhub.com/event/123" />);

    expect(screen.getByTestId('stubhub-icon')).toBeInTheDocument();
  });

  it('renders TicketmasterIcon for a ticketmaster URL', () => {
    vi.mocked(getTicketProvider).mockReturnValue('ticketmaster');

    render(<TicketProviderIcon ticketsUrl="https://www.ticketmaster.com/event/123" />);

    expect(screen.getByTestId('ticketmaster-icon')).toBeInTheDocument();
  });

  it('passes a custom size prop through to the provider icon', () => {
    vi.mocked(getTicketProvider).mockReturnValue('bandsintown');

    render(<TicketProviderIcon ticketsUrl="https://www.bandsintown.com/e/123" size={32} />);

    expect(vi.mocked(BandsintownIcon).mock.calls[0][0]).toMatchObject({ size: 32 });
  });

  it('passes a custom className prop through to the provider icon', () => {
    vi.mocked(getTicketProvider).mockReturnValue('bandsintown');

    render(
      <TicketProviderIcon ticketsUrl="https://www.bandsintown.com/e/123" className="custom-class" />
    );

    expect(screen.getByTestId('bandsintown-icon')).toHaveClass('custom-class');
  });
});
