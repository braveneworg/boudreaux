/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useNavMenuGroups } from './use-nav-menu-groups';

const mockUseNavMenuItems = vi.fn();

vi.mock('./use-nav-menu-items', () => ({
  useNavMenuItems: () => mockUseNavMenuItems(),
}));

const item = (name: string, href: string, color = `${name}-color`) => ({
  name,
  href,
  color,
});

const FLAT_SIGNED_OUT = [
  item('Home', '/'),
  item('Artists', '/artists'),
  item('Releases', '/releases', 'releases-cyan'),
  item('Videos', '/videos'),
  item('Tours', '/tours', 'tours-tan'),
  item('Merch', '/merch'),
  item('Playlists', '/playlists'),
  item('About', '/about'),
  item('Contact Us', '/contact'),
];

describe('useNavMenuGroups', () => {
  it('projects the flat items into Home · Music ▾ · Label ▾ · Contact Us', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());

    expect(result.current).toHaveLength(4);
    expect(result.current[0]).toMatchObject({ kind: 'link', item: { name: 'Home' } });
    expect(result.current[1]).toMatchObject({ kind: 'group', group: { label: 'Music' } });
    expect(result.current[2]).toMatchObject({ kind: 'group', group: { label: 'Label' } });
    expect(result.current[3]).toMatchObject({ kind: 'link', item: { name: 'Contact Us' } });
  });

  it('orders Music as Releases, Artists, Playlists, Videos', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());
    const music = result.current[1];

    if (music?.kind !== 'group') throw new Error('expected Music group');
    expect(music.group.items.map((i) => i.name)).toEqual([
      'Releases',
      'Artists',
      'Playlists',
      'Videos',
    ]);
  });

  it('orders Label as Tours, Merch, About', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT);

    const { result } = renderHook(() => useNavMenuGroups());
    const label = result.current[2];

    if (label?.kind !== 'group') throw new Error('expected Label group');
    expect(label.group.items.map((i) => i.name)).toEqual(['Tours', 'Merch', 'About']);
  });

  it('inserts My Collection top-level before Contact Us when present', () => {
    mockUseNavMenuItems.mockReturnValue([
      ...FLAT_SIGNED_OUT.slice(0, 3),
      item('My Collection', '/collection'),
      ...FLAT_SIGNED_OUT.slice(3),
    ]);

    const { result } = renderHook(() => useNavMenuGroups());

    expect(result.current.map((e) => (e.kind === 'link' ? e.item.name : e.group.label))).toEqual([
      'Home',
      'Music',
      'Label',
      'My Collection',
      'Contact Us',
    ]);
  });

  it('skips a group member absent from the flat list without crashing', () => {
    mockUseNavMenuItems.mockReturnValue(FLAT_SIGNED_OUT.filter((i) => i.href !== '/videos'));

    const { result } = renderHook(() => useNavMenuGroups());
    const music = result.current[1];

    if (music?.kind !== 'group') throw new Error('expected Music group');
    expect(music.group.items.map((i) => i.name)).toEqual(['Releases', 'Artists', 'Playlists']);
  });

  it('omits a group entirely when every member is absent from the flat list', () => {
    const labelHrefs = ['/tours', '/merch', '/about'];
    mockUseNavMenuItems.mockReturnValue(
      FLAT_SIGNED_OUT.filter((i) => !labelHrefs.includes(i.href))
    );

    const { result } = renderHook(() => useNavMenuGroups());

    expect(result.current.map((e) => (e.kind === 'link' ? e.item.name : e.group.label))).toEqual([
      'Home',
      'Music',
      'Contact Us',
    ]);
  });
});
