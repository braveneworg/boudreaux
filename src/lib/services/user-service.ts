/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '../prisma';

export const UserService = {
  ensureAdminUser: async ({
    firstName,
    lastName,
    phone,
    email,
    role = 'admin',
  }: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email: string;
    role?: string;
  }) => {
    const adminUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!adminUser) {
      console.info('🌱 Creating admin user...');
      await prisma.user.create({
        data: {
          firstName,
          lastName,
          phone,
          email,
          name: 'Admin',
          role,
          emailVerified: new Date(),
        },
      });
      console.info(`✅ Admin user, ${email}, created.`);
    } else {
      console.info(`ℹ️ Admin user, ${email}, already exists.`);
    }
  },
};
