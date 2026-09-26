/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import {
  ARTIST_NAV_SEARCH_DEBOUNCE_MS,
  ArtistNavSearchCombobox,
} from './artist-nav-search-combobox';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

const ceschi = {
  artistSlug: 'ceschi',
  artistName: 'Ceschi',
  thumbnailSrc: null,
  releases: [{ id: 'r-1', title: 'Broken Bone Ballads' }],
};

const stubSearchReturning = (results: (typeof ceschi)[]) =>
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results }),
  } as Response);

const renderCombobox = () => render(<ArtistNavSearchCombobox />, { wrapper: createQueryWrapper() });

// Timers are faked (with real-time advancement, so `findBy*` still polls) and
// the 400ms debounce is fired explicitly instead of waited out per test.
const setup = (): UserEvent =>
  userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

/** Fire the pending debounce so the typed query reaches the search hook. */
const settleDebounce = (): void => {
  act(() => {
    vi.advanceTimersByTime(ARTIST_NAV_SEARCH_DEBOUNCE_MS);
  });
};

const findTrigger = (): HTMLElement =>
  screen.getByRole('button', { name: 'Search artists and releases' });

/** Opens the popover and waits for the lazy-loaded panel's search field. */
const openSearch = async (user: UserEvent): Promise<HTMLElement> => {
  await user.click(findTrigger());
  return screen.findByPlaceholderText('Search artists & releases');
};

describe('ArtistNavSearchCombobox', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  it('renders a closed trigger showing the placeholder', () => {
    stubSearchReturning([]);
    renderCombobox();

    expect(findTrigger()).toHaveTextContent('Search artists & releases');
    expect(findTrigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('wears the same punk-zine box as the artists search', () => {
    stubSearchReturning([]);
    renderCombobox();

    expect(findTrigger()).toHaveClass(
      'border-2',
      'border-black',
      'shadow-zine-ink',
      'focus-visible:ring-(--card-accent)'
    );
  });

  it('does not render the search field until opened', () => {
    stubSearchReturning([]);
    renderCombobox();

    expect(screen.queryByPlaceholderText('Search artists & releases')).not.toBeInTheDocument();
  });

  it('opens on click to the three-character hint', async () => {
    stubSearchReturning([]);
    const user = setup();
    renderCombobox();

    await openSearch(user);

    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
  });

  it('does not fetch while the query is under three characters', async () => {
    const fetchSpy = stubSearchReturning([]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ce');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the typed query on the trigger', async () => {
    stubSearchReturning([]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');

    expect(findTrigger()).toHaveTextContent('ces');
  });

  it('shows a searching state while the typed query is debouncing', async () => {
    stubSearchReturning([ceschi]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('fetches the encoded query once three characters are typed', async () => {
    const fetchSpy = stubSearchReturning([]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'a&b');
    settleDebounce();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/artists/search?q=a%26b', expect.anything());
    });
  });

  it('lists the matching artists and their releases', async () => {
    stubSearchReturning([ceschi]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');
    settleDebounce();

    expect(await screen.findByRole('option', { name: 'Ceschi 1 release' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Broken Bone Ballads' })).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    stubSearchReturning([]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'zzz');
    settleDebounce();

    expect(await screen.findByText('No artists or releases found.')).toBeInTheDocument();
  });

  it('shows the error state when the search fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');
    settleDebounce();

    expect(await screen.findByText('Search is unavailable right now.')).toBeInTheDocument();
  });

  it('goes to the artist page when an artist is picked', async () => {
    stubSearchReturning([ceschi]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');
    settleDebounce();
    await user.click(await screen.findByRole('option', { name: 'Ceschi 1 release' }));

    expect(mockPush).toHaveBeenCalledWith('/artists/ceschi');
  });

  it('goes to the release on the artist page when a release is picked', async () => {
    stubSearchReturning([ceschi]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');
    settleDebounce();
    await user.click(await screen.findByRole('option', { name: 'Broken Bone Ballads' }));

    expect(mockPush).toHaveBeenCalledWith('/artists/ceschi?release=r-1');
  });

  it('closes and clears the query after a pick', async () => {
    stubSearchReturning([ceschi]);
    const user = setup();
    renderCombobox();

    await user.type(await openSearch(user), 'ces');
    settleDebounce();
    await user.click(await screen.findByRole('option', { name: 'Ceschi 1 release' }));

    expect(findTrigger()).toHaveAttribute('aria-expanded', 'false');
    expect(findTrigger()).toHaveTextContent('Search artists & releases');
  });
});
