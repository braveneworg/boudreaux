/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BioLinkNodeView } from './bio-link-node-view';

import type { NodeViewProps } from '@tiptap/react';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children?: ReactNode }) => (
    <span {...props}>{children}</span>
  ),
}));

interface LinkAttrs {
  href: string;
  text: string;
  external: boolean;
}

const makeProps = (attrs: LinkAttrs): NodeViewProps =>
  ({
    node: { attrs },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
    getPos: () => 7,
    extension: { options: { onEditRequest: vi.fn() } },
  }) as unknown as NodeViewProps;

describe('BioLinkNodeView', () => {
  it('renders the NodeViewWrapper with data-testid="bio-link-node"', () => {
    render(
      <BioLinkNodeView {...makeProps({ href: 'https://z.net', text: 'zine', external: false })} />
    );
    expect(document.querySelector('[data-testid="bio-link-node"]')).toBeInTheDocument();
  });

  it('renders underlined anchor text with the external icon when external', () => {
    render(
      <BioLinkNodeView {...makeProps({ href: 'https://z.net', text: 'zine', external: true })} />
    );
    expect(screen.getByText('zine')).toBeInTheDocument();
    expect(document.querySelector('[data-external-icon]')).toBeInTheDocument();
  });

  it('omits the icon for internal links', () => {
    render(
      <BioLinkNodeView {...makeProps({ href: '/releases/abc', text: 'Album', external: false })} />
    );
    expect(document.querySelector('[data-external-icon]')).not.toBeInTheDocument();
  });

  it('delete control removes the node', async () => {
    const props = makeProps({ href: 'https://z.net', text: 'zine', external: true });
    render(<BioLinkNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove link zine' }));
    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('edit control requests editing at the node position', async () => {
    const props = makeProps({ href: 'https://z.net', text: 'zine', external: true });
    render(<BioLinkNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit link zine' }));
    expect(props.extension.options.onEditRequest).toHaveBeenCalledWith(7);
  });
});
