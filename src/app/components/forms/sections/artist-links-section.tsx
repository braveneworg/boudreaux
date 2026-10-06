/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId } from 'react';
import type { JSX } from 'react';

import { ArtistLinkGroupsEditor } from '@/app/components/forms/artist-link-groups-editor';
import { ArtistLinkListEditor } from '@/app/components/forms/artist-link-list-editor';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { Control } from 'react-hook-form';

interface ArtistLinksSectionProps {
  control: Control<ArtistFormData>;
}

/**
 * The artist's curated links in their three sections (ADR-0020), edited as
 * three form arrays the Server Action composes into `Artist.links`. Edit
 * mode only, like the image manager: the arrays are loaded from the stored
 * composite, and the form holds them until Save.
 */
export const ArtistLinksSection = ({ control }: ArtistLinksSectionProps): JSX.Element => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div className="space-y-1">
        <h2 id={headingId} className="font-semibold">
          Links
        </h2>
        <p className="text-muted-foreground text-sm">
          Shown on the artist’s page in this order. A label sits beside its link; without one the
          link stands alone. Save to keep your changes.
        </p>
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Websites</legend>
        <ArtistLinkListEditor
          control={control}
          name="websiteLinks"
          heading="Website"
          section="websites"
          addLabel="Add website link"
        />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Social Media</legend>
        <ArtistLinkListEditor
          control={control}
          name="socialLinks"
          heading="Social"
          section="social"
          addLabel="Add social link"
        />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Contact &amp; Misc</legend>
        <p className="text-muted-foreground text-xs">
          Headings of your own, such as Booking or Merch. A contact link may be a URL, an email
          address or a phone number; an empty group is not saved.
        </p>
        <ArtistLinkGroupsEditor control={control} />
      </fieldset>
    </section>
  );
};
