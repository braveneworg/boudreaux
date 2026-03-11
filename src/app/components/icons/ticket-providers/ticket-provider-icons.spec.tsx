/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from '@testing-library/react';

import { BandsintownIcon } from './bandsintown-icon';
import { EventbriteIcon } from './eventbrite-icon';
import { StubhubIcon } from './stubhub-icon';
import { TicketmasterIcon } from './ticketmaster-icon';

describe('BandsintownIcon', () => {
  it('renders an SVG element', () => {
    render(<BandsintownIcon />);

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('uses a default size of 20', () => {
    render(<BandsintownIcon />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('accepts a custom size', () => {
    render(<BandsintownIcon size={32} />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('applies a custom className', () => {
    render(<BandsintownIcon className="custom-class" />);

    expect(document.querySelector('svg')).toHaveClass('custom-class');
  });

  it('has aria-hidden set to true', () => {
    render(<BandsintownIcon />);

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spreads additional props onto the SVG element', () => {
    render(<BandsintownIcon data-testid="bandsintown-svg" />);

    expect(document.querySelector('svg')).toHaveAttribute('data-testid', 'bandsintown-svg');
  });
});

describe('EventbriteIcon', () => {
  it('renders an SVG element', () => {
    render(<EventbriteIcon />);

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('uses a default size of 20', () => {
    render(<EventbriteIcon />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('accepts a custom size', () => {
    render(<EventbriteIcon size={48} />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies a custom className', () => {
    render(<EventbriteIcon className="custom-class" />);

    expect(document.querySelector('svg')).toHaveClass('custom-class');
  });

  it('has aria-hidden set to true', () => {
    render(<EventbriteIcon />);

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spreads additional props onto the SVG element', () => {
    render(<EventbriteIcon data-testid="eventbrite-svg" />);

    expect(document.querySelector('svg')).toHaveAttribute('data-testid', 'eventbrite-svg');
  });
});

describe('StubhubIcon', () => {
  it('renders an SVG element', () => {
    render(<StubhubIcon />);

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('uses a default size of 20', () => {
    render(<StubhubIcon />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('accepts a custom size', () => {
    render(<StubhubIcon size={24} />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
  });

  it('applies a custom className', () => {
    render(<StubhubIcon className="custom-class" />);

    expect(document.querySelector('svg')).toHaveClass('custom-class');
  });

  it('has aria-hidden set to true', () => {
    render(<StubhubIcon />);

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spreads additional props onto the SVG element', () => {
    render(<StubhubIcon data-testid="stubhub-svg" />);

    expect(document.querySelector('svg')).toHaveAttribute('data-testid', 'stubhub-svg');
  });
});

describe('TicketmasterIcon', () => {
  it('renders an SVG element', () => {
    render(<TicketmasterIcon />);

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('uses a default size of 20', () => {
    render(<TicketmasterIcon />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
  });

  it('accepts a custom size', () => {
    render(<TicketmasterIcon size={16} />);
    const svg = document.querySelector('svg');

    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
  });

  it('applies a custom className', () => {
    render(<TicketmasterIcon className="custom-class" />);

    expect(document.querySelector('svg')).toHaveClass('custom-class');
  });

  it('has aria-hidden set to true', () => {
    render(<TicketmasterIcon />);

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spreads additional props onto the SVG element', () => {
    render(<TicketmasterIcon data-testid="ticketmaster-svg" />);

    expect(document.querySelector('svg')).toHaveAttribute('data-testid', 'ticketmaster-svg');
  });
});
