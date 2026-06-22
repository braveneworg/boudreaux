/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactElement } from 'react';

import { formatFieldDate, readField, toFieldLabel } from '../data-view-utils';

interface EntityFieldListProps<T extends Record<string, unknown>> {
  item: T;
  /** Field names from the entity to display. */
  fieldsToShow: string[];
  /** Resolves the entity's display name, used as a fallback for an empty `displayName`. */
  resolveDisplayName: (item: T) => string;
}

/**
 * Renders an entity's configured fields as labelled rows. Fields ending in `At`/`On`
 * are formatted as dates; an empty `displayName` falls back to the resolved name.
 */
export const EntityFieldList = <T extends Record<string, unknown>>({
  item,
  fieldsToShow,
  resolveDisplayName,
}: EntityFieldListProps<T>): ReactElement => (
  <>
    {fieldsToShow.map((field, index) => {
      const fieldValue = readField(item, field);
      const isDateField = field.endsWith('At') || field.endsWith('On');
      const displayValue = isDateField
        ? formatFieldDate(fieldValue)
        : field === 'displayName' && !fieldValue
          ? resolveDisplayName(item)
          : String(fieldValue ?? '-');

      return (
        <span className="ml-2 leading-7" key={`${field}-${index + 1}`}>
          <b>{toFieldLabel(field)}</b>: <span>{displayValue}</span>
        </span>
      );
    })}
  </>
);
