/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCreateBioLinkMutation } from '@/app/hooks/mutations/use-bio-media-mutations';

import { CustomLinkEditor } from './custom-link-editor';

// Mock the mutation hook so the component test never touches TanStack Query.
vi.mock('@/app/hooks/mutations/use-bio-media-mutations', () => ({
  useCreateBioLinkMutation: vi.fn(),
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
let capturedOnCreated: (() => void) | undefined;

beforeEach(() => {
  createBioLink.mockReset();
  capturedOnCreated = undefined;
  vi.mocked(useCreateBioLinkMutation).mockImplementation(
    (_artistId: string, onCreated?: () => void) => {
      capturedOnCreated = onCreated;
      return { createBioLink, isCreatingBioLink: false };
    }
  );
});

describe('CustomLinkEditor', () => {
  it('renders the label, url, and kind fields', () => {
    render(<CustomLinkEditor artistId="a1" />);

    expect(screen.getByLabelText('Link label')).toBeInTheDocument();
    expect(screen.getByLabelText('Link URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Link kind')).toBeInTheDocument();
  });

  it('wires the mutation to the given artist id', () => {
    render(<CustomLinkEditor artistId="a1" />);

    expect(useCreateBioLinkMutation).toHaveBeenCalledWith('a1', expect.any(Function));
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
    act(() => capturedOnCreated?.());

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
    vi.mocked(useCreateBioLinkMutation).mockReturnValue({
      createBioLink,
      isCreatingBioLink: true,
    });
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
