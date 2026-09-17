/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createBioImageInputSchema,
  setDisplayImagesInputSchema,
  updateBioImageAltInputSchema,
  updateBioImageAttributionInputSchema,
} from './bio-image-input-schema';

const validCreate = {
  artistId: '507f1f77bcf86cd799439011',
  url: 'https://cdn.example/x.webp',
  attribution: 'Uploaded by admin',
};

describe('createBioImageInputSchema', () => {
  it('accepts a minimal valid input', () => {
    expect(createBioImageInputSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a missing attribution', () => {
    const { attribution: _attribution, ...rest } = validCreate;
    expect(createBioImageInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-ObjectId artistId', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, artistId: 'nope' }).success).toBe(
      false
    );
  });

  it('rejects a non-url image url', () => {
    expect(createBioImageInputSchema.safeParse({ ...validCreate, url: 'not-a-url' }).success).toBe(
      false
    );
  });
});

describe('updateBioImageAttributionInputSchema', () => {
  const imageId = '507f1f77bcf86cd799439011';

  it('accepts a text attribution', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: 'New credit' }).success
    ).toBe(true);
  });

  it('accepts a null attribution (clearing)', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId, attribution: null }).success
    ).toBe(true);
  });

  it('rejects a non-ObjectId imageId', () => {
    expect(
      updateBioImageAttributionInputSchema.safeParse({ imageId: 'nope', attribution: 'x' }).success
    ).toBe(false);
  });
});

describe('updateBioImageAltInputSchema', () => {
  const imageId = '507f1f77bcf86cd799439011';

  it('accepts alt text', () => {
    expect(
      updateBioImageAltInputSchema.safeParse({ imageId, alt: 'Ceschi on stage' }).success
    ).toBe(true);
  });

  it('accepts a null alt (clearing)', () => {
    expect(updateBioImageAltInputSchema.safeParse({ imageId, alt: null }).success).toBe(true);
  });

  it('rejects alt text over 500 characters', () => {
    expect(updateBioImageAltInputSchema.safeParse({ imageId, alt: 'a'.repeat(501) }).success).toBe(
      false
    );
  });

  it('rejects a non-ObjectId imageId', () => {
    expect(updateBioImageAltInputSchema.safeParse({ imageId: 'nope', alt: 'x' }).success).toBe(
      false
    );
  });
});

describe('setDisplayImagesInputSchema', () => {
  const artistId = '507f1f77bcf86cd799439011';
  const ids = ['665f1f77bcf86cd799439021', '665f1f77bcf86cd799439022', '665f1f77bcf86cd799439023'];

  it('accepts up to the cap of unique image ids', () => {
    expect(setDisplayImagesInputSchema.safeParse({ artistId, imageIds: ids }).success).toBe(true);
  });

  it('accepts an empty list (clearing every display image)', () => {
    expect(setDisplayImagesInputSchema.safeParse({ artistId, imageIds: [] }).success).toBe(true);
  });

  it('rejects more ids than the cap', () => {
    const tooMany = [...ids, '665f1f77bcf86cd799439024'];
    expect(setDisplayImagesInputSchema.safeParse({ artistId, imageIds: tooMany }).success).toBe(
      false
    );
  });

  it('rejects a repeated id', () => {
    const repeated = [ids[0], ids[0]];
    expect(setDisplayImagesInputSchema.safeParse({ artistId, imageIds: repeated }).success).toBe(
      false
    );
  });

  it('rejects a non-ObjectId image id', () => {
    expect(setDisplayImagesInputSchema.safeParse({ artistId, imageIds: ['nope'] }).success).toBe(
      false
    );
  });

  it('rejects a non-ObjectId artistId', () => {
    expect(setDisplayImagesInputSchema.safeParse({ artistId: 'nope', imageIds: [] }).success).toBe(
      false
    );
  });
});
