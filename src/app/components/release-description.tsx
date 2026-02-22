/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseDescription — renders plain text description for a release.
 * Uses `whitespace-pre-line` to preserve line breaks and `break-words`
 * for overflow protection. Returns null when no description is provided.
 */

interface ReleaseDescriptionProps {
  /** The release description text, or null if absent */
  description: string | null;
}

/**
 * Release description section. Conditionally rendered: returns null
 * when description is null or empty.
 */
export const ReleaseDescription = ({ description }: ReleaseDescriptionProps) => {
  if (!description) {
    return null;
  }

  return (
    <div data-testid="release-description" className="whitespace-pre-line break-words px-4 py-4">
      {description}
    </div>
  );
};
