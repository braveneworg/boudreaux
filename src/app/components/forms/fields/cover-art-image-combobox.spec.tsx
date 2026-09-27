/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';
import { artistDetailSchema } from '@/lib/validation/media/artist-schema';

import { CoverArtImageCombobox } from './cover-art-image-combobox';

import type { ArtistDetail } from '../_hooks/use-artist-query';

const useArtistsQuery = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-artists-query', () => ({ useArtistsQuery }));

const useArtistBioImagesQuery = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-artist-bio-images-query', () => ({ useArtistBioImagesQuery }));

// Render next/image as a plain <img> via createElement (not JSX) so findByAltText
// works while sidestepping the @next/next/no-img-element lint rule.
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => createElement('img', { alt, src }),
}));

// Radix Command (cmdk) scrolls the active item into view on open; jsdom lacks it.
Element.prototype.scrollIntoView = vi.fn();

/**
 * Builds a fully-typed {@link ArtistDetail} by parsing a minimal raw object
 * through the real schema, so fixtures stay precise without hand-listing every
 * scalar field. Only the name-related fields the component reads are varied.
 */
const buildArtist = (overrides: {
  id: string;
  firstName?: string;
  surname?: string;
  displayName?: string | null;
}): ArtistDetail =>
  artistDetailSchema.parse({
    id: overrides.id,
    firstName: overrides.firstName ?? '',
    middleName: null,
    surname: overrides.surname ?? '',
    akaNames: null,
    displayName: overrides.displayName ?? null,
    title: null,
    suffix: null,
    phone: null,
    email: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    bio: null,
    shortBio: null,
    altBio: null,
    bioGeneratedAt: null,
    bioModel: null,
    bioStatus: null,
    bioError: null,
    bioStartedAt: null,
    bioJobToken: null,
    bioProgress: null,
    imageLinksStatus: null,
    imageLinksError: null,
    imageLinksStartedAt: null,
    imageLinksJobToken: null,
    imageLinksAddedCount: null,
    slug: `slug-${overrides.id}`,
    genres: null,
    bornOn: null,
    diedOn: null,
    formedOn: null,
    publishedOn: null,
    publishedBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
    deletedOn: null,
    deletedBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    reactivatedAt: null,
    reactivatedBy: null,
    notes: [],
    tags: null,
    isPseudonymous: false,
    isActive: true,
    instruments: null,
    featuredArtistId: null,
  });

/** Builds one bio image pool row as the picker query returns it. */
const buildImage = (overrides: Partial<BioStatusImage> & { id: string }): BioStatusImage => ({
  url: `https://cdn.test/${overrides.id}.jpg`,
  attribution: null,
  isPrimary: false,
  displayOrder: null,
  ...overrides,
});

const baseProps = {
  artistIds: ['artist-1'],
  currentValue: '',
  disabled: false,
  isUploading: false,
  onSelect: vi.fn(),
};

const setArtistsById = (artistsById: Record<string, ArtistDetail | null | undefined>): void => {
  useArtistsQuery.mockReturnValue({ artistsById, isPending: false });
};

const setPools = (
  imagesByArtistId: Record<string, BioStatusImage[] | undefined>,
  isPending = false
): void => {
  useArtistBioImagesQuery.mockReturnValue({ imagesByArtistId, isPending });
};

// Once open, cmdk's CommandInput also exposes `role="combobox"`, so capture the
// trigger before opening rather than querying it again afterwards.
const openPopover = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  const trigger = screen.getByRole('combobox');
  await user.click(trigger);
  return trigger;
};

describe('CoverArtImageCombobox', () => {
  beforeEach(() => {
    setArtistsById({ 'artist-1': buildArtist({ id: 'artist-1', displayName: 'The Band' }) });
    setPools({ 'artist-1': [] });
  });

  it('renders nothing when no artist ids are provided', () => {
    const { container } = render(<CoverArtImageCombobox {...baseProps} artistIds={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the helper label when artist ids are provided', () => {
    render(<CoverArtImageCombobox {...baseProps} />);

    expect(screen.getByText('Or select from artist images:')).toBeInTheDocument();
  });

  it('shows the default trigger label when nothing is selected', () => {
    render(<CoverArtImageCombobox {...baseProps} />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Choose from artist images...');
  });

  it('queries the bio image pools of every provided artist, in a stable order', () => {
    render(<CoverArtImageCombobox {...baseProps} artistIds={['artist-2', 'artist-1']} />);

    expect(useArtistBioImagesQuery).toHaveBeenCalledWith(['artist-1', 'artist-2']);
  });

  it('opens the popover on click', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    const trigger = await openPopover(user);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the search input placeholder when open', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(screen.getByPlaceholderText('Search artist images...')).toBeInTheDocument();
  });

  it('shows the empty state when the artist has no images', async () => {
    const user = userEvent.setup({ delay: null });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('No artist images found.')).toBeInTheDocument();
  });

  it('disables the trigger with a loading label while the pools are pending', () => {
    setPools({ 'artist-1': undefined }, true);
    render(<CoverArtImageCombobox {...baseProps} />);

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveTextContent('Loading artist images...');
  });

  it('disables the trigger via the disabled prop', () => {
    render(<CoverArtImageCombobox {...baseProps} disabled />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('disables the trigger via the isUploading prop', () => {
    render(<CoverArtImageCombobox {...baseProps} isUploading />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders an option for each pool image with its artist name', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('The Band')).toBeInTheDocument();
  });

  it('keeps the pool order the query returns: display images first', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({
      'artist-1': [
        buildImage({ id: 'display', title: 'Chosen', displayOrder: 0 }),
        buildImage({ id: 'suggested', title: 'Suggested', isPrimary: true }),
        buildImage({ id: 'rest', title: 'Rest' }),
      ],
    });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => within(option).getByRole('img').getAttribute('alt'))).toEqual([
      'Chosen',
      'Suggested',
      'Rest',
    ]);
  });

  it('badges display images and suggested images', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({
      'artist-1': [
        buildImage({ id: 'display', displayOrder: 0 }),
        buildImage({ id: 'suggested', isPrimary: true }),
        buildImage({ id: 'rest' }),
      ],
    });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    const [display, suggested, rest] = await screen.findAllByRole('option');
    expect(within(display).getByText('Display')).toBeInTheDocument();
    expect(within(suggested).getByText('Suggested')).toBeInTheDocument();
    expect(within(rest).queryByText(/Display|Suggested/)).not.toBeInTheDocument();
  });

  it('lists the pools of several artists in artist order', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({
      'artist-1': buildArtist({ id: 'artist-1', displayName: 'One' }),
      'artist-2': buildArtist({ id: 'artist-2', displayName: 'Two' }),
    });
    setPools({
      'artist-1': [buildImage({ id: 'a' })],
      'artist-2': [buildImage({ id: 'b' })],
    });
    render(<CoverArtImageCombobox {...baseProps} artistIds={['artist-2', 'artist-1']} />);

    await openPopover(user);

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['One', 'Two']);
  });

  it('renders the image title as the caption when present', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1', title: 'Live at the Apollo' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('Live at the Apollo')).toBeInTheDocument();
  });

  it('uses the image alt text for the thumbnail when provided', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1', alt: 'A cool photo', title: 'cap' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('A cool photo')).toBeInTheDocument();
  });

  it('falls back to the title for the thumbnail alt when alt text is absent', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1', title: 'Just a caption' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('Just a caption')).toBeInTheDocument();
  });

  it('falls back to a generic alt when neither alt text nor title is present', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByAltText('Artist image')).toBeInTheDocument();
  });

  it('calls onSelect with the image url when an option is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    setPools({ 'artist-1': [buildImage({ id: 'img-1', url: 'https://cdn.test/chosen.jpg' })] });
    render(<CoverArtImageCombobox {...baseProps} onSelect={onSelect} />);

    await openPopover(user);
    await user.click(await screen.findByRole('option'));

    expect(onSelect).toHaveBeenCalledWith('https://cdn.test/chosen.jpg');
  });

  it('closes the popover after an option is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);
    await user.click(await screen.findByRole('option'));

    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
    );
  });

  it('shows the selected trigger label when currentValue matches an image', () => {
    setPools({ 'artist-1': [buildImage({ id: 'img-1', url: 'https://cdn.test/sel.jpg' })] });
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    expect(screen.getByText('The Band - image selected')).toBeInTheDocument();
  });

  it('marks the selected option with an opaque check indicator', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1', url: 'https://cdn.test/sel.jpg' })] });
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    await openPopover(user);

    expect(await screen.findByRole('option')).toContainHTML('opacity-100');
  });

  it('does not mark an unselected option as checked', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1', url: 'https://cdn.test/other.jpg' })] });
    render(<CoverArtImageCombobox {...baseProps} currentValue="https://cdn.test/sel.jpg" />);

    await openPopover(user);

    expect(await screen.findByRole('option')).toContainHTML('opacity-0');
  });

  it('falls back to first/last name when displayName is empty', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({
      'artist-1': buildArtist({ id: 'artist-1', firstName: 'Ada', surname: 'Lovelace' }),
    });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('shows "(no name)" when an artist has no name parts', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({ 'artist-1': buildArtist({ id: 'artist-1' }) });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('shows "(no name)" when the queried artist entry is null', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({ 'artist-1': null });
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('shows "(no name)" when the artist is absent from the name map', async () => {
    const user = userEvent.setup({ delay: null });
    setArtistsById({});
    setPools({ 'artist-1': [buildImage({ id: 'img-1' })] });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('(no name)')).toBeInTheDocument();
  });

  it('treats a pool that has not loaded as empty', async () => {
    const user = userEvent.setup({ delay: null });
    setPools({ 'artist-1': undefined });
    render(<CoverArtImageCombobox {...baseProps} />);

    await openPopover(user);

    expect(await screen.findByText('No artist images found.')).toBeInTheDocument();
  });
});
