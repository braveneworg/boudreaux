/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Vite's `?raw` suffix imports a file's text. The packaging specs read
// `template.yaml` and the `Dockerfile` this way.
declare module '*?raw' {
  const text: string;
  export default text;
}
