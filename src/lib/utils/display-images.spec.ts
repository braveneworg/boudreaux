/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  chosenDisplayImageIds,
  DISPLAY_IMAGE_CAP,
  isDisplayEligible,
  orderBioImagesForPicker,
  resolveDisplayImages,
} from './display-images';

interface Row {
  id: string;
  isPrimary: boolean;
  displayOrder: number | null;
  alt: string | null;
}

/** Build a row in pool (sort) order; not chosen and not suggested by default. */
const row = (id: string, overrides: Partial<Omit<Row, 'id'>> = {}): Row => ({
  id,
  isPrimary: false,
  displayOrder: null,
  alt: 'alt',
  ...overrides,
});

const ids = (rows: Row[]): string[] => rows.map(({ id }) => id);

describe('DISPLAY_IMAGE_CAP', () => {
  it('is three, the number of slots the public artist page renders', () => {
    expect(DISPLAY_IMAGE_CAP).toBe(3);
  });
});

describe('resolveDisplayImages', () => {
  it('returns the chosen rows in displayOrder, ignoring pool order', () => {
    const rows = [
      row('c', { displayOrder: 2 }),
      row('a', { displayOrder: 0 }),
      row('x'),
      row('b', { displayOrder: 1 }),
    ];

    expect(ids(resolveDisplayImages(rows))).toEqual(['a', 'b', 'c']);
  });

  it('prefers a human choice over the suggested images', () => {
    const rows = [
      row('s1', { isPrimary: true }),
      row('s2', { isPrimary: true }),
      row('h', { displayOrder: 0 }),
    ];

    expect(ids(resolveDisplayImages(rows))).toEqual(['h']);
  });

  it('keeps the relative order when a delete left a gap in the positions', () => {
    const rows = [row('late', { displayOrder: 2 }), row('early', { displayOrder: 0 })];

    expect(ids(resolveDisplayImages(rows))).toEqual(['early', 'late']);
  });

  it('truncates more than the cap of chosen rows to the first positions', () => {
    const rows = [0, 1, 2, 3].map((position) => row(`p${position}`, { displayOrder: position }));

    expect(ids(resolveDisplayImages(rows))).toEqual(['p0', 'p1', 'p2']);
  });

  it('falls back to the suggested rows in pool order while nothing is chosen', () => {
    const rows = [
      row('x'),
      row('s1', { isPrimary: true }),
      row('y'),
      row('s2', { isPrimary: true }),
    ];

    expect(ids(resolveDisplayImages(rows))).toEqual(['s1', 's2']);
  });

  it('caps the suggested fallback', () => {
    const rows = ['s1', 's2', 's3', 's4'].map((id) => row(id, { isPrimary: true }));

    expect(ids(resolveDisplayImages(rows))).toEqual(['s1', 's2', 's3']);
  });

  it('falls back to the first pool rows when nothing is chosen or suggested', () => {
    const rows = ['x', 'y', 'z', 'w'].map((id) => row(id));

    expect(ids(resolveDisplayImages(rows))).toEqual(['x', 'y', 'z']);
  });

  it('returns an empty list for an empty pool', () => {
    expect(resolveDisplayImages([])).toEqual([]);
  });

  it('treats an absent position as not chosen (rows serialised before the field existed)', () => {
    const rows = [
      { id: 'legacy', isPrimary: true, alt: null },
      { id: 'chosen', isPrimary: false, alt: null, displayOrder: 0 },
    ];

    expect(resolveDisplayImages(rows).map(({ id }) => id)).toEqual(['chosen']);
  });

  it('does not mutate the input', () => {
    const rows = [row('b', { displayOrder: 1 }), row('a', { displayOrder: 0 })];
    const snapshot = [...rows];

    resolveDisplayImages(rows);

    expect(rows).toEqual(snapshot);
  });
});

describe('chosenDisplayImageIds', () => {
  it('lists the chosen ids in displayOrder', () => {
    const rows = [row('b', { displayOrder: 1 }), row('x'), row('a', { displayOrder: 0 })];

    expect(chosenDisplayImageIds(rows)).toEqual(['a', 'b']);
  });

  it('is empty while nothing is chosen, even with suggestions', () => {
    expect(chosenDisplayImageIds([row('s', { isPrimary: true })])).toEqual([]);
  });
});

describe('isDisplayEligible', () => {
  it('accepts a row with alt text', () => {
    expect(isDisplayEligible({ alt: 'Ceschi on stage' })).toBe(true);
  });

  it('rejects a null alt', () => {
    expect(isDisplayEligible({ alt: null })).toBe(false);
  });

  it('rejects whitespace-only alt', () => {
    expect(isDisplayEligible({ alt: '   ' })).toBe(false);
  });

  it('rejects an absent alt', () => {
    expect(isDisplayEligible({})).toBe(false);
  });
});

describe('orderBioImagesForPicker', () => {
  it('orders chosen by position, then suggested, then the rest, each in pool order', () => {
    const rows = [
      row('r1'),
      row('s1', { isPrimary: true }),
      row('c2', { displayOrder: 1 }),
      row('r2'),
      row('c1', { displayOrder: 0 }),
      row('s2', { isPrimary: true }),
    ];

    expect(ids(orderBioImagesForPicker(rows))).toEqual(['c1', 'c2', 's1', 's2', 'r1', 'r2']);
  });

  it('lists a chosen row once even when it is also suggested', () => {
    const rows = [row('s', { isPrimary: true }), row('both', { isPrimary: true, displayOrder: 0 })];

    expect(ids(orderBioImagesForPicker(rows))).toEqual(['both', 's']);
  });

  it('returns every row', () => {
    const rows = [row('a'), row('b', { displayOrder: 0 }), row('c', { isPrimary: true })];

    expect(orderBioImagesForPicker(rows)).toHaveLength(3);
  });
});
