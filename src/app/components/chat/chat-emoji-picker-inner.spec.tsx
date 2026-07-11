// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentProps, ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatEmojiPickerInner } from './chat-emoji-picker-inner';

import type {
  EmojiPickerListComponents,
  EmojiPickerListProps,
  EmojiPickerRootProps,
} from 'frimousse';

// frimousse's virtualized list measures real layout (ResizeObserver,
// client heights) that jsdom cannot provide, so the module boundary is
// mocked: the wrapper's prop wiring and zine-styled list internals are
// asserted here, while the real data-fetch/search/virtualization path is
// exercised end-to-end by e2e/tests/chat-drawer.spec.ts.
const captured = vi.hoisted(() => ({
  root: [] as unknown[],
  list: [] as unknown[],
}));

vi.mock('frimousse', () => ({
  EmojiPicker: {
    Root: (props: EmojiPickerRootProps) => {
      captured.root.push(props);
      return (
        <div data-testid="frimousse-root">
          <button
            type="button"
            onClick={() => props.onEmojiSelect?.({ emoji: '😀', label: 'grinning face' })}
          >
            emit-selection
          </button>
          {props.children}
        </div>
      );
    },
    Search: (props: ComponentProps<'input'>) => <input data-testid="frimousse-search" {...props} />,
    Viewport: ({ children }: { children?: ReactNode }) => (
      <div data-testid="frimousse-viewport">{children}</div>
    ),
    Loading: ({ children }: { children?: ReactNode }) => (
      <span data-testid="frimousse-loading">{children}</span>
    ),
    Empty: ({ children }: { children?: ReactNode }) => (
      <span data-testid="frimousse-empty">{children}</span>
    ),
    List: (props: EmojiPickerListProps) => {
      captured.list.push(props);
      return <div data-testid="frimousse-list" />;
    },
  },
}));

beforeEach(() => {
  captured.root.length = 0;
  captured.list.length = 0;
});

describe('ChatEmojiPickerInner', () => {
  it('wires the same-origin data source and locale into the picker root', () => {
    render(<ChatEmojiPickerInner onSelect={vi.fn()} />);

    const root = captured.root[0] as EmojiPickerRootProps;
    // CSP allows connect-src 'self' only — never frimousse's jsdelivr default.
    expect(root.emojibaseUrl).toBe('/api/emoji-data');
    expect(root.locale).toBe('en');
    expect(root.columns).toBeGreaterThan(0);
  });

  it('maps a frimousse selection to the plain emoji string', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    render(<ChatEmojiPickerInner onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'emit-selection' }));

    expect(onSelect).toHaveBeenCalledWith('😀');
  });

  it('renders search, loading, empty, and list slots inside the viewport', () => {
    render(<ChatEmojiPickerInner onSelect={vi.fn()} />);

    expect(screen.getByTestId('frimousse-search')).toBeInTheDocument();
    expect(screen.getByTestId('frimousse-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('frimousse-loading')).toHaveTextContent('Loading emoji…');
    expect(screen.getByTestId('frimousse-empty')).toHaveTextContent('No emoji found');
    expect(screen.getByTestId('frimousse-list')).toBeInTheDocument();
  });

  it('renders the zine-styled list internals (category header, row, emoji button)', () => {
    render(<ChatEmojiPickerInner onSelect={vi.fn()} />);

    const listProps = captured.list[0] as EmojiPickerListProps;
    const components = listProps.components as EmojiPickerListComponents;
    const { CategoryHeader, Row, Emoji } = components;

    render(
      <>
        <CategoryHeader category={{ label: 'Smileys & emotion' }} />
        <Row>
          <span>row-content</span>
        </Row>
        <Emoji emoji={{ emoji: '🔥', label: 'fire', isActive: false }} aria-label="fire" />
      </>
    );

    expect(screen.getByText('Smileys & emotion')).toBeInTheDocument();
    expect(screen.getByText('row-content')).toBeInTheDocument();
    const emojiButton = screen.getByRole('button', { name: 'fire' });
    expect(emojiButton).toHaveTextContent('🔥');
    expect(emojiButton).toHaveAttribute('type', 'button');
  });
});
