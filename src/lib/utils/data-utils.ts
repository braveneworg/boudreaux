/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export async function extractFieldsWithValues<T extends Record<string, unknown>>(
  jsonPromise: Promise<T>
): Promise<Partial<T>> {
  const data = await jsonPromise;

  return Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key as keyof T] = value as T[keyof T];
    }
    return acc;
  }, {} as Partial<T>);
}
