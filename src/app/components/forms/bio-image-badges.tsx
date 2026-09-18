/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { JSX } from 'react';

import { Badge } from '@/app/components/ui/badge';

interface LicenseBadgeProps {
  license: string | null | undefined;
  licenseUrl: string | null | undefined;
}

/**
 * License provenance for a bio image: the license short name as a Badge
 * (linked to its machine-readable license page when known), or muted
 * "Rights unknown" text when the discovery captured no license at all.
 */
export const LicenseBadge = ({ license, licenseUrl }: LicenseBadgeProps): JSX.Element => {
  if (!license) {
    return <span className="text-muted-foreground text-[10px]">Rights unknown</span>;
  }

  const badge = (
    <Badge variant="outline" className="bg-background/80 text-[10px]">
      {license}
    </Badge>
  );

  if (!licenseUrl) return badge;

  return (
    <a
      href={licenseUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${license} license (opens in a new tab)`}
      className="hover:opacity-80"
    >
      {badge}
    </a>
  );
};

interface FaceBadgeProps {
  hasFace: boolean | null | undefined;
  faceScore: number | null | undefined;
}

/**
 * Positive face-detection signal for a bio image: a "Face NN%" badge when
 * Rekognition returned a confidence score, or a bare "Face" badge when a face
 * was detected without a score. Renders nothing for a false/absent signal —
 * the badge is never a negative marker, so the absence of a face is simply the
 * absence of a badge.
 */
export const FaceBadge = ({ hasFace, faceScore }: FaceBadgeProps): JSX.Element | null => {
  if (faceScore != null) {
    const percent = Math.round(faceScore);
    return (
      <Badge
        variant="outline"
        aria-label={`Face match ${percent}%`}
        className="bg-background/80 text-[10px]"
      >
        {`Face ${percent}%`}
      </Badge>
    );
  }
  if (hasFace === true) {
    return (
      <Badge variant="outline" aria-label="Face detected" className="bg-background/80 text-[10px]">
        Face
      </Badge>
    );
  }
  return null;
};
