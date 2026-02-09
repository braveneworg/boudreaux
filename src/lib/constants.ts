export const CONSTANTS = {
  ROLES: {
    ADMIN: 'admin',
  },
  AUTHENTICATION: {
    STATUS: {
      AUTHENTICATED: 'authenticated',
      LOADING: 'loading',
    },
  },
  ENV: {
    DEVELOPMENT: 'development',
  },
  LOG: {
    PREFIX: {
      AUTH_TOOLBAR: '[AuthToolbar]',
    },
  },
  CDN: {
    // Use NEXT_PUBLIC_CDN_DOMAIN for client-side or fallback to default
    BASE_URL: process.env.NEXT_PUBLIC_CDN_DOMAIN || 'https://cdn.fakefourrecords.com',
  },
  NA: 'N/A',
};

export const ENTITIES = {
  artist: 'artist',
  release: 'release',
  track: 'track',
  group: 'group',
  featuredArtist: 'featuredArtist',
} as const;
