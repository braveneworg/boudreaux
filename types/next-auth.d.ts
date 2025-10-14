// types/next-auth.d.ts (or similar)
import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // Ensure id is defined
      username: string; // Add username if needed

      // Profile fields
      firstName?: string;
      lastName?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
      allowSmsNotifications?: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string; // Ensure id is defined
    username: string;
    emailVerified?: Date; // Ensure emailVerified is defined and optional

    // Profile fields
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    allowSmsNotifications?: boolean;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser extends DefaultUser {
    id: string;
    username: string;
    emailVerified?: Date | null;

    // Profile fields
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    allowSmsNotifications?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    username: string;
    // Add other custom properties if needed
  }
}
