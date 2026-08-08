/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { defineConfig } from 'prisma/config';

// Generate-only usage: this project never connects to the database from the
// Prisma CLI, so no env loading is needed here.
export default defineConfig({
  schema: '../prisma/schema.prisma',
});
