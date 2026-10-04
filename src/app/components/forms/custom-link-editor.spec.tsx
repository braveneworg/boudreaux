/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useArtistPool } from './_hooks/use-artist-pool';
import { CustomLinkEditor } from './custom-link-editor';

// Mock the pool module so the component test never touches TanStack Query.
vi.mock('./_hooks/use-artist-pool', () => ({
  useArtistPool: vi.fn(),
}));

// Mock Radix Select with a native control so jsdom can drive value changes.
vi.mock('@/app/components/ui/select', () => {
  let onValueChangeFn: ((value: string) => void) | undefined;
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: ReactNode;
      value: string;
      onValueChange: (v: string) => void;
    }) => {
      onValueChangeFn = onValueChange;
      return (
        <div data-testid="select-root" data-value={value}>
          {children}
        </div>
      );
    },
    SelectTrigger: ({ children, ...props }: Record<string, unknown> & { children: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    SelectValue: () => <span data-testid="select-value" />,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
      <button data-testid={`select-option-${value}`} onClick={() => onValueChangeFn?.(value)}>
        {children}
      </button>
    ),
  };
});

const createBioLink = vi.fn();

/** The pool slice the editor renders; `addLink` resolves a row so the fields reset. */
const mockPool = (overrides: { isMutating?: boolean } = {}): void => {
  vi.mocked(useArtistPool).mockReturnValue({
    addLink: createBioLink,
    isMutating: false,
    ...overrides,
  } as never);
};

beforeEach(() => {
  createBioLink.mockReset();
  createBioLink.mockResolvedValue({ id: 'l-new' });
  mockPool();
});

describe('CustomLinkEditor', () => {
  it('renders the label, url, and kind fields', () => {
    render(<CustomLinkEditor artistId="a1" />);

    expect(screen.getByLabelText('Link label')).toBeInTheDocument();
    expect(screen.getByLabelText('Link URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Link kind')).toBeInTheDocument();
  });

  it('renders the pool for the given artist', () => {
    render(<CustomLinkEditor artistId="a1" />);

    expect(useArtistPool).toHaveBeenCalledWith('a1');
  });

  it('submits the entered label, url, and kind through the mutation', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Official site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'https://example.com');
    await userEvent.click(screen.getByTestId('select-option-official'));
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(createBioLink).toHaveBeenCalledWith({
      artistId: 'a1',
      label: 'Official site',
      url: 'https://example.com',
      kind: 'official',
    });
  });

  it('omits kind from the payload when none is chosen', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(createBioLink).toHaveBeenCalledWith({
      artistId: 'a1',
      label: 'Site',
      url: 'https://example.com',
    });
  });

  it('clears the fields after a successful create', async () => {
    render(<CustomLinkEditor artistId="a1" />);
    const label = screen.getByLabelText('Link label');
    const url = screen.getByLabelText('Link URL');

    await userEvent.type(label, 'Site');
    await userEvent.type(url, 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(label).toHaveValue(''));
    expect(url).toHaveValue('');
  });

  it('shows an inline hint for an invalid url', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link URL'), 'not-a-url');

    expect(screen.getByText('Enter a valid http(s) URL')).toBeInTheDocument();
  });

  it('blocks submit while the url is invalid', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'not-a-url');

    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
  });

  it('blocks submit while the label is empty', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link URL'), 'https://example.com');

    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
  });

  it('does not call the mutation when submit is blocked', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'not-a-url');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(createBioLink).not.toHaveBeenCalled();
  });

  it('disables the submit button while a create is in flight', async () => {
    mockPool({ isMutating: true });
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'https://example.com');

    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
  });

  it('submits on Enter from the url field', async () => {
    render(<CustomLinkEditor artistId="a1" />);

    await userEvent.type(screen.getByLabelText('Link label'), 'Site');
    await userEvent.type(screen.getByLabelText('Link URL'), 'https://example.com{Enter}');

    expect(createBioLink).toHaveBeenCalledWith({
      artistId: 'a1',
      label: 'Site',
      url: 'https://example.com',
    });
  });
});
