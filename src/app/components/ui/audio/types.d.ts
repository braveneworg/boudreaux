interface Release {
  id: string;
  title: string;
  format: string;
  year: number;
  label: string;
  catalogNumber: string;
  coverArt: string;
  bandcampUrl: string;
  releasedOn: number;
}

interface Artist {
  id: string;
  displayName: string;
  first: string;
  last: string;
  name: string;
  pics: string[];
  releases: Release[];
  artists: Artist[];
  bandcampUrl: string;
}
