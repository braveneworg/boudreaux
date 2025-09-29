import NextAuth, { NextAuthConfig } from 'next-auth';
import User, { IUserDocument } from '@/app/models/user';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import client from '@/app/lib/db';
import Nodemailer from 'next-auth/providers/nodemailer';
import { Model } from 'mongoose';
import { AdapterUser } from 'next-auth/adapters';

//keywords: auth, next-auth, mongodb, mongoose, mongodb-adapter
//docs: https://authjs.dev/reference/adapters/mongodb-adapter

// For more information on each option (and a full list of options) go to
// https://next-auth.js.org/configuration/options

// For more information on each option (and a full list of options) go to
// https://next-auth.js.org/configuration/providers/oauth
// https://next-auth.js.org/providers/

// For more information on using MongoDB with NextAuth.js, see:
// https://authjs.dev/guides/database/mongodb

// For more information on using Mongoose with NextAuth.js, see:
// https://authjs.dev/guides/database/mongoose

// For more information on using environment variables with NextAuth.js, see:
// https://next-auth.js.org/configuration/options#environment-variables

// You can add more providers here
// https://next-auth.js.org/providers/overview
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(client),
  providers: [
    // TODO: Uncomment Google and OAuth (requires Keycloak container; TBD), and add other providers here
    // Example:
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_ID!,
    //   clientSecret: process.env.GOOGLE_SECRET!,
    // }),
    // OAuthProvider({
    //   id: "example",
    //   name: "Example",
    //   type: "oauth",
    //   clientId: process.env.EXAMPLE_ID!,
    //   clientSecret: process.env.EXAMPLE_SECRET!,
    //   authorization: {
    //     url: "https://example.com/oauth/authorize",
    //     params: { scope: "read:user" },
    //   },
    //   token: "https://example.com/oauth/token",
    //   userinfo: "https://example.com/oauth/userinfo",
    //   profile(profile) {
    //     return {
    //       id: profile.id,
    //       name: profile.name,
    //       email: profile.email,
    //       image: profile.picture,
    //     };
    //   },
    // }),
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
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async redirect({ baseUrl }) {
      // Upon logging in we want to redirect to the home page
      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        // Don't return the password or email
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { email, ...newUser } = user as typeof Model<IUserDocument> & { email: string };

        console.log('auth.ts: JWT callback - user signed in, user:', newUser);

        token.user = newUser;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.user && session) {
        session.user = token.user as AdapterUser & IUserDocument;

        console.log('auth.ts: Session callback - session:', session);
      }
      return session;
    },
  },
} satisfies NextAuthConfig);
