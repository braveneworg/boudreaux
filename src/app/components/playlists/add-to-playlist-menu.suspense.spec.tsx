/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Suspense } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { AddToPlaylistMenu } from './add-to-playlist-menu';

// The App Router bundler aliases `next/dynamic` to the app-dir implementation,
// whose Loadable only wraps the lazy component in its own Suspense boundary when
// `ssr: false` or a `loading` component is supplied. Vitest resolves the bare
// specifier to the pages-router implementation (which always provides a
// boundary), so point it at the app-dir module to test what production runs.
vi.mock('next/dynamic', async () => {
  const mod = await import('next/dist/shared/lib/app-dynamic');
  return { default: mod.default };
});

vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ status: 'authenticated' }) }));

interface DotNavStubProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}
vi.mock('@/app/components/ui/audio/media-player', () => ({
  MediaPlayer: {
    DotNavMenu: ({ children, open, onOpenChange, label }: DotNavStubProps) => (
      <div>
        <button type="button" aria-label={label} onClick={() => onOpenChange?.(!open)}>
          menu
        </button>
        {open ? <div data-testid="popover-content">{children}</div> : null}
      </div>
    ),
  },
}));

// Gate the panel module so the lazy chunk stays "in flight" until the test
// releases it — this is the window in which the ancestor boundary must NOT
// be asked to show its fallback.
const panelGate = vi.hoisted(() => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
});
vi.mock('./add-to-playlist-panel', async () => {
  await panelGate.promise;
  return {
    AddToPlaylistPanel: () => <div data-testid="panel-body">panel</div>,
  };
});

vi.mock('./create-playlist-dialog', () => ({
  CreatePlaylistDialog: () => null,
}));

const item: PlaylistSearchItem = {
  key: 'track:tf1:rel1',
  itemType: 'track',
  title: 'Test Song',
  artistName: 'Test Artist',
  coverArt: null,
  duration: 210,
  source: { trackFileId: 'tf1', releaseId: 'rel1' },
};

describe('AddToPlaylistMenu lazy-chunk suspense containment', () => {
  it('opens the popover without suspending the surrounding page boundary', async () => {
    const user = userEvent.setup();

    render(
      <Suspense fallback={<div data-testid="page-fallback">route loading</div>}>
        <AddToPlaylistMenu item={item} />
      </Suspense>
    );

    const trigger = await screen.findByRole('button', { name: 'Add to a playlist' });
    await user.click(trigger);

    // While the panel chunk is still loading, the page-level boundary must keep
    // showing its content: no route fallback, trigger still visible.
    expect(screen.queryByTestId('page-fallback')).not.toBeInTheDocument();
    expect(trigger).toBeVisible();
    expect(screen.getByTestId('popover-content')).toBeInTheDocument();

    // Releasing the chunk fills the popover in place.
    panelGate.release();
    expect(await screen.findByTestId('panel-body')).toBeInTheDocument();
    expect(screen.queryByTestId('page-fallback')).not.toBeInTheDocument();
  });
});
