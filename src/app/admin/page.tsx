import { BreadcrumbMenu } from '../components/ui/breadcrumb-menu';

export default function AdminPage() {
  return (
    <div>
      <BreadcrumbMenu items={[{ anchorText: 'Admin', url: '/admin', isActive: true }]} />
      <h1>Admin Dashboard</h1>
      <h2>Releases 🎉</h2>
      {/* Release management components would go here */}
      {/*
        appleMusicURL? (Should be the URL to the Apple Music page if applicable; e.g., "https://music.apple.com/album/album-name/id123456789"),
        artists[] (Should be an array of artist IDs associated with this release; can be multiple artists for collaborations),
        artistsOrdering (Should be an array of artist IDs in the order they should be displayed; typically matches the Artists array),
        bandcampUrl? (Should be the URL to the Bandcamp page if applicable; e.g., "https://artist.bandcamp.com/album/album-name"),
        blueskyUrl? (Should be the URL to https://bsky.app/profile/[handle], e.g., "https://bsky.app/profile/artist.bsky.social"),
        catalogNumber (Should be the catalog number assigned by the label; e.g., "AR-2024-001"),
        coverArtURL (Should be the URL to the cover art image; e.g., "https://example.com/cover-art.jpg"),
        description (Should be a brief description or summary of the release; e.g., "The debut album from Awesome Band, featuring hit singles and fan favorites."),
        durationInSeconds (Should be the total duration of the release in seconds; e.g., 3600 for a one-hour album; write a function to calculate the number of seconds in given the number of minutes and seconds),
        featuredTrackList[] (Should be an array of track IDs that are featured tracks for promotional purposes; they should open in their respective platforms' Desktop applications or tap "Stream" to listen to the music from your desktop or mobile device),
          - URL format: https://music.apple.com/us/album/[album-name]/[album-id]?i=[song-id]
          - Get the URL by right-clicking on the song in Apple Music and selecting "Copy Link".
        formats[] (Should be an array of formats for the release; e.g., ["digital", "CD", "vinyl"]),
        genres[] (Should be an array of genres for the release; e.g., ["rock", "pop", "jazz"]),
        isFeaturedArtist, (Should be a boolean indicating if the artist is featured in the featured artists section; true or false),
        images[] (Should be an array of additional image URLs associated with the release; e.g., ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]),
        isPublished, (Should be a boolean indicating if the release is published and visible to users; true or false),
        name, (Should be the name/title of the album, single, ep, video, or other media you're adding; ie. "Broken Bone Ballads"),
        notes? (totally optional; never shown to user; think of it like a place to add anything about the release you'd like to keep notes on),
        publishedAt, (Should be the date the release was published on this site; can be in the past or future),
        releasedAt, (Should be the official release date; can be in the past or future),
        spotifyURL? (Should be the URL to the Spotify page if applicable; e.g., "https://open.spotify.com/album/1A2B3C4D5E6F7G8H9I0J"),
        subgenres[] (Should be a more specific subgenre if applicable; e.g., ["indie rock", "synth-pop"]),
        tracklist[] (Should be an array of track objects, each containing details like title, duration, and featuring artists; same as FeaturedTrackList but with more details, specifically all of the tracks on the album),
        xProfileUrl? (Should be the URL to the X (formerly Twitter) post if applicable; e.g., "https://twitter.com/artist/status/1234567890123456789"),
        instagramProfileUrl? (Should be the URL to the Instagram profile if applicable; e.g., "https://instagram.com/artist"),
        updatedAt, (Should be the date the release was last updated; typically set automatically),
        youtubeMusicURL? (Should be the URL to the YouTube Music page if applicable; e.g., "https://music.youtube.com/playlist?list=PL1234567890ABCDEFGHIJ"),
          */}
    </div>
  );
}
