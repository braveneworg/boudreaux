// types/next-auth.d.ts (or similar)
import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module '@auth/core/types' {
  interface User extends DefaultUser {
    id: string;
    username?: string;
    email: string;
    emailVerified?: Date | null;
    role?: string;

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

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username?: string;
      email: string;
      emailVerified?: Date;
      role?: string;

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
    id: string;
    username?: string;
    email: string;
    emailVerified?: Date;
    role?: string;

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
    user: User & AdapterUser;
  }
}
