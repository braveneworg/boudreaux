import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';

import { prisma } from '@/app/lib/prisma';
import { CustomPrismaAdapter } from '@/app/lib/prisma-adapter';

import type { User } from 'next-auth';
import type { AdapterUser } from 'next-auth/adapters';

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

// Validate AUTH_SECRET exists and is sufficiently long
if (!process.env.AUTH_SECRET) {
  throw new Error('AUTH_SECRET environment variable is required');
}

if (process.env.AUTH_SECRET.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters long for security');
}

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
    async jwt({ token, user, trigger, session }) {
      // Handle session updates (when user profile is updated)
      if (trigger === 'update' && session) {
        // Merge the updated session data into the token
        token.user = {
          ...((token.user as object) || {}),
          ...((session as object) || {}),
        };
        return token;
      }

      // Initial sign in - store user data in token
      if (user) {
        token.user = user as User;
      }

      // On subsequent requests, refresh user data from database
      // This ensures session stays in sync with latest user data
      if (token.user && typeof token.user === 'object' && 'id' in token.user && !trigger) {
        try {
          const userId = (token.user as { id: string }).id;
          const freshUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
              email: true,
              emailVerified: true,
              role: true,
              firstName: true,
              lastName: true,
              phone: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              zipCode: true,
              country: true,
              allowSmsNotifications: true,
              // Add other fields you want in the session
            },
          });

          if (freshUser) {
            // Security: Check if role has changed - force re-authentication if so
            const oldRole = (token.user as { role?: string }).role;
            if (oldRole && freshUser.role !== oldRole) {
              // Clear token to force re-login when role changes
              if (process.env.NODE_ENV === 'development') {
                console.warn('User role changed - re-authentication required', {
                  userId: freshUser.id,
                  oldRole,
                  newRole: freshUser.role,
                });
              }
              throw new Error('Role changed - re-authentication required');
            }

            token.user = freshUser;
          }
        } catch (error) {
          // Log error safely without exposing sensitive data
          if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching user data:', error);
          } else {
            console.error(
              'Error fetching user data:',
              error instanceof Error ? error.message : 'Unknown error'
            );
          }
          // Keep existing token data if database fetch fails
        }
      }

      return token;
    },
    async redirect({ baseUrl }) {
      // Upon logging in we want to redirect to the home page
      return baseUrl;
    },
    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      session &&
        (session.user = token.user as User &
          AdapterUser & { id: string; username: string; email: string; role: string });

      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: '/signin',
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? `__Secure-next-auth.session-token`
          : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  // Enable CSRF protection
  useSecureCookies: process.env.NODE_ENV === 'production',
});
