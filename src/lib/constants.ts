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
  NA: 'N/A',
};

export const ENTITIES = {
  artist: 'artist',
  release: 'release',
  track: 'track',
  group: 'group',
  featuredArtist: 'featuredArtist',
} as const;
