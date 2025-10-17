// types/next-auth.d.ts (or similar)
import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string; // Ensure id is defined
      username: string; // Add username if needed
      email: string; // Ensure email is included in session
      emailVerified?: Date; // Ensure emailVerified is defined and optional
      role?: string; // e.g., 'user', 'admin'

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
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string; // Ensure id is defined
    username: string;
    email: string; // Ensure email is defined
    emailVerified?: Date; // Ensure emailVerified is defined and optional
    role?: string; // e.g., 'user', 'admin'

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

declare module 'next-auth/adapters' {
  interface AdapterUser extends DefaultUser {
    id: string;
    username: string;
    email: string;
    emailVerified?: Date | null;
    previousEmail?: string; // For tracking previous email during changes
    role?: string; // e.g., 'user', 'admin'

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

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    username: string;
    email: string;
    role?: string;
    // Add other custom properties if needed
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
