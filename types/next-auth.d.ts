// types/next-auth.d.ts (or similar)
import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // Ensure id is defined
      // Add other custom properties if needed
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string; // Ensure id is defined
    emailVerified?: Date; // Ensure emailVerified is defined and optional
    // Add other custom properties if needed
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    // Add other custom properties if needed
  }
}
