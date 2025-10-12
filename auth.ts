import NextAuth from 'next-auth';
import type { User } from "next-auth"
import type { AdapterUser } from "next-auth/adapters"
import Nodemailer from 'next-auth/providers/nodemailer';
import GoogleProvider from "next-auth/providers/google"
import { prisma } from '@/app/lib/prisma';
import { CustomPrismaAdapter } from '@/app/lib/prisma-adapter';

//keywords: auth, next-auth, mongodb, mongodb-adapter
//docs: https://authjs.dev/reference/adapters/mongodb-adapter

// For more information on each option (and a full list of options) go to
// https://next-auth.js.org/configuration/options

// For more information on each option (and a full list of options) go to
// https://next-auth.js.org/configuration/providers/oauth
// https://next-auth.js.org/providers/

// For more information on using MongoDB with NextAuth.js, see:
// https://authjs.dev/guides/database/mongodb

// For more information on using environment variables with NextAuth.js, see:
// https://next-auth.js.org/configuration/options#environment-variables

// You can add more providers here
// https://next-auth.js.org/providers/overview

// Prisma Adapter Docs: https://authjs.dev/reference/adapters/prisma-adapter
// Prisma Adapter GitHub: https://github.com/next-auth/prisma-adapter
// Prisma Schema: https://authjs.dev/guides/database/prisma
// Prisma Client: https://www.prisma.io/docs/concepts/components/prisma-client

// Prisma and MongoDB Notes:
// - MongoDB does not support transactions. Any operations that would normally
//   be wrapped in a transaction will be executed sequentially instead.
// - MongoDB does not support relations. Any relational fields will be ignored
//   when using the Prisma Adapter with MongoDB.
// - MongoDB does not support some query filters, such as `contains` and `startsWith`.
//   These filters will throw an error if used with the Prisma Adapter and MongoDB.

// Prisma Schema Notes:
// - The `@db.ObjectId` attribute is used to indicate that a field should be
//   treated as an ObjectId in MongoDB.
// - The `@map` attribute is used to map a field to a different name in the database.
// - The `@@index` attribute is used to create an index on a field or fields.
// - The `@@unique` attribute is used to create a unique index on a field or fields.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 25),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Don't return the password or email
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { email, ...newUser } = user as User;

        token.user = newUser;
      }

      return token;
    },
    async redirect({ baseUrl }) {
      // Upon logging in we want to redirect to the home page
      return baseUrl;
    },
    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      session && (session.user = token.user as User & AdapterUser & { id: string; username: string });

      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/auth/signin',
    // signOut: '/auth/signout',
    // error: '/auth/error',
  },
});
