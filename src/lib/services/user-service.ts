import { prisma } from '../prisma';

export const UserService = {
  ensureAdminUser: async ({
    firstName,
    lastName,
    phone,
    email,
    role = 'admin',
  }: {
    [key: string]: string;
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
