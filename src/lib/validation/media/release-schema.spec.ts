/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  publishedReleaseDetailSchema,
  publishedReleaseListingSchema,
  releaseCarouselItemSchema,
  releaseSchema,
} from './release-schema';
import {
  digitalFormat,
  digitalFormatFile,
  image,
  publishedReleaseDetail,
  publishedReleaseListing,
  release,
  releaseScalar,
  url,
} from './schema-fixtures';

describe('releaseSchema', () => {
  it('parses a release with all relations and json extendedData', () => {
    expect(() => releaseSchema.parse(release)).not.toThrow();
  });

  it('coerces a serialized file size number into a bigint', () => {
    expect(releaseSchema.parse(release).digitalFormats[0].files[0].fileSize).toBe(1234n);
  });

  it('coerces the releasedOn string into a Date', () => {
    expect(releaseSchema.parse(release).releasedOn).toBeInstanceOf(Date);
  });

  it('rejects a release with an unknown format enum value', () => {
    expect(() => releaseSchema.parse({ ...release, formats: ['NOT_A_FORMAT'] })).toThrow();
  });

  it('rejects a release whose url has an invalid platform', () => {
    const releaseUrls = [
      { id: 'ru1', releaseId: 'r1', urlId: 'u1', url: { ...url, platform: 'X' } },
    ];
    expect(() => releaseSchema.parse({ ...release, releaseUrls })).toThrow();
  });
});

describe('releaseCarouselItemSchema', () => {
  it('parses a release carousel item', () => {
    expect(() =>
      releaseCarouselItemSchema.parse({ ...releaseScalar, images: [image] })
    ).not.toThrow();
  });
});

describe('publishedReleaseListingSchema', () => {
  it('parses a published release listing projection', () => {
    expect(() => publishedReleaseListingSchema.parse(publishedReleaseListing)).not.toThrow();
  });

  it('coerces the releasedOn string into a Date', () => {
    expect(publishedReleaseListingSchema.parse(publishedReleaseListing).releasedOn).toBeInstanceOf(
      Date
    );
  });

  it('rejects a listing missing required coverArt', () => {
    const { coverArt: _omit, ...invalid } = publishedReleaseListing;
    expect(() => publishedReleaseListingSchema.parse(invalid)).toThrow();
  });
});

describe('publishedReleaseDetailSchema', () => {
  it('parses a withTracks release detail payload', () => {
    expect(() => publishedReleaseDetailSchema.parse(publishedReleaseDetail)).not.toThrow();
  });

  it('preserves a runtime streamUrl signed onto a digital format file', () => {
    const withStream = {
      ...publishedReleaseDetail,
      digitalFormats: [
        { ...digitalFormat, files: [{ ...digitalFormatFile, streamUrl: 'https://cf/signed' }] },
      ],
    };
    expect(
      publishedReleaseDetailSchema.parse(withStream).digitalFormats[0].files[0].streamUrl
    ).toBe('https://cf/signed');
  });
});
