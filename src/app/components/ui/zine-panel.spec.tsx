/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ZinePanel, type ZineAccent } from './zine-panel';

vi.mock('../chat/chat-panel-trigger', () => ({
  ChatPanelTrigger: () => <div data-testid="chat-panel-trigger" />,
}));

/** Literal accent → class pairs guarding the component map against drift. */
const ACCENT_CASES: ReadonlyArray<[ZineAccent, string]> = [
  ['yellow', 'zine-accent-yellow'],
  ['hot-pink', 'zine-accent-hot-pink'],
  ['pink', 'zine-accent-pink'],
  ['cyan', 'zine-accent-cyan'],
  ['tan', 'zine-accent-tan'],
  ['orange', 'zine-accent-orange'],
  ['green', 'zine-accent-green'],
  ['teal', 'zine-accent-teal'],
  ['mustard', 'zine-accent-mustard'],
  ['kraft', 'zine-accent-kraft'],
  ['denim', 'zine-accent-denim'],
  ['storm', 'zine-accent-storm'],
  ['orchid', 'zine-accent-orchid'],
];

const getSection = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('section[data-slot="zine-panel"]');

const getTape = (container: HTMLElement): HTMLElement | null =>
  container.querySelector('span[aria-hidden="true"]');

describe('ZinePanel', () => {
  it('renders a section with data-slot="zine-panel"', () => {
    const { container } = render(<ZinePanel accent="yellow">Panel body</ZinePanel>);
    expect(getSection(container)).toBeInTheDocument();
  });

  it('renders no breadcrumb trail by default', () => {
    const { container } = render(<ZinePanel accent="yellow">Panel body</ZinePanel>);
    expect(container.querySelector('[data-slot="breadcrumb-menu"]')).toBeNull();
  });

  it('renders no chat dock by default', () => {
    render(<ZinePanel accent="yellow">Panel body</ZinePanel>);
    expect(screen.queryByTestId('chat-panel-trigger')).not.toBeInTheDocument();
  });

  it('docks the chat trigger at the end of the panel content when chat is set', () => {
    render(
      <ZinePanel accent="yellow" chat>
        Panel body
      </ZinePanel>
    );

    const dock = screen.getByTestId('chat-panel-trigger');
    const content = screen.getByText('Panel body');
    expect(content).toContainElement(dock);
    expect(content.lastElementChild).toBe(dock);
  });

  it('renders the breadcrumb trail inside the panel above the content', () => {
    const { container } = render(
      <ZinePanel
        accent="yellow"
        breadcrumbs={[{ anchorText: 'Releases', url: '/releases', isActive: true }]}
      >
        Panel body
      </ZinePanel>
    );

    const crumbs = container.querySelector('[data-slot="breadcrumb-menu"]');
    expect(crumbs).toBeInTheDocument();
    // Lives in the padded content div, before the children.
    const content = screen.getByText('Panel body');
    expect(crumbs?.parentElement).toBe(content);
    expect(crumbs).toBe(content.firstElementChild);
  });

  it('drops the breadcrumb horizontal nudge inside the panel', () => {
    const { container } = render(
      <ZinePanel
        accent="yellow"
        breadcrumbs={[{ anchorText: 'Releases', url: '/releases', isActive: true }]}
      >
        Panel body
      </ZinePanel>
    );

    // The panel padding supplies the horizontal offset; vertical spacing
    // stays whatever the breadcrumb component's own defaults say.
    const crumbs = container.querySelector('[data-slot="breadcrumb-menu"]');
    expect(crumbs).toHaveClass('left-0');
    expect(crumbs).not.toHaveClass('left-5');
  });

  it('tightens the top padding so the breadcrumb trail sits snug to the panel top', () => {
    render(
      <ZinePanel
        accent="yellow"
        breadcrumbs={[{ anchorText: 'Releases', url: '/releases', isActive: true }]}
      >
        Panel body
      </ZinePanel>
    );

    // Only the top inset shrinks; horizontal/bottom padding is untouched.
    const content = screen.getByText('Panel body');
    expect(content).toHaveClass('pt-3', 'sm:pt-4');
    expect(content).not.toHaveClass('pt-4');
  });

  it('keeps the default top padding when no breadcrumb trail is present', () => {
    render(<ZinePanel accent="yellow">Panel body</ZinePanel>);

    const content = screen.getByText('Panel body');
    expect(content).toHaveClass('pt-4');
    expect(content).not.toHaveClass('pt-3');
  });

  it('renders children inside the inner content div', () => {
    const { container } = render(<ZinePanel accent="yellow">Panel body</ZinePanel>);
    const content = screen.getByText('Panel body');
    expect(content).toHaveClass('p-6');
    expect(content.parentElement).toBe(getSection(container));
  });

  it.each(ACCENT_CASES)('renders the %s accent with class %s', (accent, accentClass) => {
    const { container } = render(<ZinePanel accent={accent}>Panel body</ZinePanel>);
    expect(getSection(container)).toHaveClass(accentClass);
  });

  it('applies the zine paper base classes to the section', () => {
    const { container } = render(<ZinePanel accent="teal">Panel body</ZinePanel>);
    expect(getSection(container)).toHaveClass(
      'shadow-zine',
      'border-t-2',
      'border-l-2',
      'border-black',
      'w-full',
      'overflow-visible',
      'bg-menu-item-tan-100'
    );
  });

  it('renders the decorative tape span by default', () => {
    const { container } = render(<ZinePanel accent="yellow">Panel body</ZinePanel>);
    expect(getTape(container)).toBeInTheDocument();
  });

  it('styles the tape as yellow masking tape on every accent', () => {
    const { container } = render(<ZinePanel accent="denim">Panel body</ZinePanel>);
    expect(getTape(container)).toHaveClass(
      'bg-menu-item-yellow-200/85',
      '-rotate-2',
      'border-black/25'
    );
  });

  it('omits the tape span when tape is false', () => {
    const { container } = render(
      <ZinePanel accent="yellow" tape={false}>
        Panel body
      </ZinePanel>
    );
    expect(getTape(container)).not.toBeInTheDocument();
  });

  it('cn-merges contentClassName onto the inner content div', () => {
    render(
      <ZinePanel accent="yellow" contentClassName="p-0">
        Panel body
      </ZinePanel>
    );
    const content = screen.getByText('Panel body');
    expect(content).toHaveClass('p-0');
    expect(content).not.toHaveClass('p-6');
  });

  it('cn-merges className onto the section', () => {
    const { container } = render(
      <ZinePanel accent="yellow" className="mt-0">
        Panel body
      </ZinePanel>
    );
    const section = getSection(container);
    expect(section).toHaveClass('mt-0');
    expect(section).not.toHaveClass('mt-4');
  });

  it('spreads section props like id and aria-label', () => {
    render(
      <ZinePanel accent="yellow" id="tour-panel" aria-label="Tour dates">
        Panel body
      </ZinePanel>
    );
    expect(screen.getByRole('region', { name: 'Tour dates' })).toHaveAttribute('id', 'tour-panel');
  });

  it('draws the black border only on the top and left edges', () => {
    render(
      <ZinePanel accent="storm" tape={false} data-testid="panel">
        <p>content</p>
      </ZinePanel>
    );
    const panel = screen.getByTestId('panel');
    expect(panel.className).toContain('border-t-2');
    expect(panel.className).toContain('border-l-2');
    expect(panel.className).not.toContain('border-2');
  });

  it('keeps the accent offset shadow as the right/bottom edge', () => {
    render(
      <ZinePanel accent="storm" tape={false} data-testid="panel">
        <p>content</p>
      </ZinePanel>
    );
    expect(screen.getByTestId('panel').className).toContain('shadow-zine');
  });
});
