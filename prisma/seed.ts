import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

import { UserService } from '@/lib/services/user-service';

const prisma = new PrismaClient();

const createPrimaryAdminUser = async () => {
  if (
    !process.env.ADMIN_FIRST_NAME ||
    !process.env.ADMIN_LAST_NAME ||
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PHONE
  ) {
    console.error(
      '❌ Check that the following environment variables are set: ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, ADMIN_PHONE'
    );
    process.exit(1);
  }

  await UserService.ensureAdminUser({
    firstName: process.env.ADMIN_FIRST_NAME,
    lastName: process.env.ADMIN_LAST_NAME,
    email: process.env.ADMIN_EMAIL,
    phone: process.env.ADMIN_PHONE,
    role: 'admin',
  });
};

const createArtists = async (count: number) => {
  const artistData = Array.from({ length: count }).map(() => ({
    firstName: faker.person.firstName(),
    surname: faker.person.lastName(),
    slug: faker.helpers
      .slugify(faker.person.fullName().replace(/[^a-zA-Z0-9]/gi, '')) // Remove special characters before slugifying
      .toLowerCase(),
    displayName: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    bio: faker.lorem.paragraph(),
  }));

  await prisma.artist.createMany({
    data: artistData,
  });
};

const createGroups = async (count: number) => {
  const groupData = Array.from({ length: count }).map(() => ({
    name: faker.music.genre() + ' ' + faker.word.noun(),
    shortBio: faker.lorem.sentence(),
    bio: faker.lorem.paragraph(),
    formedOn: faker.date.past({ years: 10 }),
  }));

  await prisma.group.createMany({
    data: groupData,
  });
};

const createReleases = async (count: number) => {
  const releaseData = Array.from({ length: count }).map(() => ({
    title: faker.music.songName(),
    description: faker.lorem.sentences(2),
    releasedOn: faker.date.past({ years: 3 }),
    coverArt: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
  }));

  await prisma.release.createMany({
    data: releaseData,
  });
};

// Sample audio URLs that actually work for testing
const sampleAudioUrls = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
];

const createTracks = async (count: number) => {
  const trackData = Array.from({ length: count }).map((_, index) => ({
    title: faker.music.songName(),
    coverArt: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
    duration: faker.number.int({ min: 120, max: 420 }), // Duration in seconds
    audioUrl: sampleAudioUrls[index % sampleAudioUrls.length],
    position: index,
  }));

  await prisma.track.createMany({
    data: trackData,
  });
};

/**
 * Create releases with multiple tracks linked via ReleaseTrack
 * This creates albums with 4-8 tracks each
 */
const createReleasesWithTracks = async () => {
  // Clear existing release-track links first to avoid unique constraint errors on re-seed
  await prisma.releaseTrack.deleteMany({});

  const releases = await prisma.release.findMany();
  const tracks = await prisma.track.findMany();

  if (releases.length === 0 || tracks.length === 0) {
    console.warn('⚠️ No releases or tracks found. Skipping release-track linking.');
    return;
  }

  // Assign tracks to releases (each release gets 4-8 tracks)
  let trackIndex = 0;
  for (const release of releases) {
    const trackCount = faker.number.int({ min: 4, max: 8 });
    const releaseTracks = [];

    for (let i = 0; i < trackCount && trackIndex < tracks.length; i++) {
      releaseTracks.push({
        releaseId: release.id,
        trackId: tracks[trackIndex].id,
      });
      trackIndex++;
    }

    // Create ReleaseTrack entries for this release
    if (releaseTracks.length > 0) {
      await prisma.releaseTrack.createMany({
        data: releaseTracks,
      });
    }

    // Wrap around if we run out of tracks
    if (trackIndex >= tracks.length) {
      trackIndex = 0;
    }
  }

  console.info('✅ Linked tracks to releases via ReleaseTrack.');
};

const createFeaturedArtists = async (count: number) => {
  const artists = await prisma.artist.findMany();
  const groups = await prisma.group.findMany();

  // Get releases with their tracks
  const releases = await prisma.release.findMany({
    include: {
      releaseTracks: {
        include: {
          track: true,
        },
      },
    },
  });

  // Filter to only releases that have tracks
  const releasesWithTracks = releases.filter((r) => r.releaseTracks.length > 0);

  if (artists.length === 0) {
    console.warn('⚠️ No artists found. Skipping featured artists creation.');
    return;
  }

  if (releasesWithTracks.length === 0) {
    console.warn('⚠️ No releases with tracks found. Skipping featured artists creation.');
    return;
  }

  // Create featured artists one at a time to handle the Artist[] relation
  for (let i = 0; i < count; i++) {
    const randomArtist = faker.helpers.arrayElement(artists);
    // Pick a release that has tracks, then pick one of its tracks as the featured track
    const randomRelease = faker.helpers.arrayElement(releasesWithTracks);
    const randomReleaseTrack = faker.helpers.arrayElement(randomRelease.releaseTracks);
    // Group is optional
    const randomGroup = groups.length > 0 ? faker.helpers.arrayElement(groups) : null;

    await prisma.featuredArtist.create({
      data: {
        displayName: faker.helpers.maybe(() => faker.person.fullName(), { probability: 0.3 }),
        featuredOn: faker.date.recent({ days: 30 }),
        position: i + 1,
        description: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.7 }),
        coverArt: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
        track: { connect: { id: randomReleaseTrack.track.id } },
        release: { connect: { id: randomRelease.id } },
        ...(randomGroup && { group: { connect: { id: randomGroup.id } } }),
        artists: {
          connect: [{ id: randomArtist.id }],
        },
      },
    });
  }

  console.info(`✅ Created ${count} featured artists.`);
};

/**
 * Create notification banners with various configurations
 * Dates are set dynamically relative to current time so they display when seeded
 * Mix of solid color backgrounds and image backgrounds
 */
const createNotifications = async (adminUserId: string) => {
  // Delete existing notifications first (so we get fresh dates on re-seed)
  await prisma.notification.deleteMany({});

  const now = new Date();

  // Sample notification data with different configurations
  // Mix of solid backgrounds and image backgrounds using picsum.photos
  const notifications = [
    {
      // Banner with background IMAGE
      message: 'Welcome to Brave New Org',
      secondaryMessage: 'Discover new music from independent artists',
      notes: 'Main welcome banner with concert image',
      imageUrl: 'https://picsum.photos/seed/concert/1920/1080',
      originalImageUrl: 'https://picsum.photos/seed/concert/1920/1080',
      backgroundColor: null,
      isOverlayed: true,
      messageFont: 'system-ui',
      messageFontSize: 3.0,
      messageContrast: 100,
      messageTextColor: '#ffffff',
      messageTextShadow: true,
      messageTextShadowDarkness: 70,
      messagePositionX: 50,
      messagePositionY: 30,
      secondaryMessageFont: 'system-ui',
      secondaryMessageFontSize: 1.5,
      secondaryMessageContrast: 90,
      secondaryMessageTextColor: '#e0e0e0',
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 60,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 70,
      sortOrder: 1,
      isActive: true,
      publishedAt: now,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      linkUrl: 'https://braveneworg.bandcamp.com',
    },
    {
      // Banner with SOLID background
      message: 'New Release Available',
      secondaryMessage: 'Check out our latest album',
      notes: 'Promotional banner with solid color',
      imageUrl: null,
      originalImageUrl: null,
      backgroundColor: '#16213e',
      isOverlayed: true,
      messageFont: 'Georgia',
      messageFontSize: 2.8,
      messageContrast: 100,
      messageTextColor: '#ffd700',
      messageTextShadow: true,
      messageTextShadowDarkness: 70,
      messagePositionX: 50,
      messagePositionY: 35,
      secondaryMessageFont: 'Georgia',
      secondaryMessageFontSize: 1.8,
      secondaryMessageContrast: 95,
      secondaryMessageTextColor: '#ffffff',
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 50,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 65,
      sortOrder: 2,
      isActive: true,
      publishedAt: now,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      linkUrl: null,
    },
    {
      // Banner with background IMAGE
      message: 'Live Show This Weekend',
      secondaryMessage: 'Join us for an unforgettable night',
      notes: 'Event promotion with stage image',
      imageUrl: 'https://picsum.photos/seed/stage/1920/1080',
      originalImageUrl: 'https://picsum.photos/seed/stage/1920/1080',
      backgroundColor: null,
      isOverlayed: true,
      messageFont: 'Impact',
      messageFontSize: 3.5,
      messageContrast: 100,
      messageTextColor: '#ff6b6b',
      messageTextShadow: true,
      messageTextShadowDarkness: 80,
      messagePositionX: 50,
      messagePositionY: 30,
      secondaryMessageFont: 'Arial',
      secondaryMessageFontSize: 2.0,
      secondaryMessageContrast: 90,
      secondaryMessageTextColor: '#ffffff',
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 50,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 70,
      sortOrder: 3,
      isActive: true,
      publishedAt: now,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      linkUrl: null,
    },
    {
      // Banner with SOLID background (gradient-like dark purple)
      message: 'Subscribe to Our Newsletter',
      secondaryMessage: 'Stay updated with the latest releases',
      notes: 'Newsletter signup prompt with solid color',
      imageUrl: null,
      originalImageUrl: null,
      backgroundColor: '#533483',
      isOverlayed: true,
      messageFont: 'Helvetica',
      messageFontSize: 2.5,
      messageContrast: 100,
      messageTextColor: '#ffffff',
      messageTextShadow: false,
      messageTextShadowDarkness: 50,
      messagePositionX: 50,
      messagePositionY: 40,
      secondaryMessageFont: 'system-ui',
      secondaryMessageFontSize: 1.8,
      secondaryMessageContrast: 95,
      secondaryMessageTextColor: '#e0e0e0',
      secondaryMessageTextShadow: false,
      secondaryMessageTextShadowDarkness: 50,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 60,
      sortOrder: 4,
      isActive: true,
      publishedAt: now,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
      linkUrl: null,
    },
    {
      // Banner with background IMAGE
      message: 'Limited Edition Vinyl',
      secondaryMessage: 'Get yours before they are gone!',
      notes: 'Vinyl merchandise promotion with music image',
      imageUrl: 'https://picsum.photos/seed/vinyl/1920/1080',
      originalImageUrl: 'https://picsum.photos/seed/vinyl/1920/1080',
      backgroundColor: null,
      isOverlayed: true,
      messageFont: 'Arial Black',
      messageFontSize: 3.0,
      messageContrast: 100,
      messageTextColor: '#ffffff',
      messageTextShadow: true,
      messageTextShadowDarkness: 90,
      messagePositionX: 50,
      messagePositionY: 25,
      secondaryMessageFont: 'Arial',
      secondaryMessageFontSize: 1.6,
      secondaryMessageContrast: 100,
      secondaryMessageTextColor: '#ffeb3b',
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 70,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 75,
      sortOrder: 5,
      isActive: true,
      publishedAt: now,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      linkUrl: null,
    },
    {
      // Banner with SOLID background (inactive for testing)
      message: 'Coming Soon',
      secondaryMessage: 'Something big is on the horizon',
      notes: 'Teaser banner - inactive',
      imageUrl: null,
      originalImageUrl: null,
      backgroundColor: '#e94560',
      isOverlayed: true,
      messageFont: 'Georgia',
      messageFontSize: 3.2,
      messageContrast: 100,
      messageTextColor: '#ffffff',
      messageTextShadow: true,
      messageTextShadowDarkness: 60,
      messagePositionX: 50,
      messagePositionY: 40,
      secondaryMessageFont: 'Georgia',
      secondaryMessageFontSize: 1.5,
      secondaryMessageContrast: 85,
      secondaryMessageTextColor: '#ffffff',
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 40,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 60,
      sortOrder: 6,
      isActive: false, // Inactive notification for testing
      publishedAt: null,
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
      linkUrl: null,
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.create({
      data: {
        ...notification,
        addedBy: { connect: { id: adminUserId } },
      },
    });
  }

  console.info(`✅ Created ${notifications.length} notification banners.`);
};

async function main() {
  // Check for --drop-database flag
  const shouldDropDatabase = process.argv.includes('--drop-database');
  const isProduction = process.env.NODE_ENV === 'production';

  if (shouldDropDatabase) {
    if (isProduction) {
      console.error('❌ Cannot drop database in production environment!');
      process.exit(1);
    }

    console.info('🗑️  Dropping all collections...');

    // Get list of all collections
    const collections = await prisma.$runCommandRaw({
      listCollections: 1,
    });

    // Drop each collection
    if (collections && typeof collections === 'object' && 'cursor' in collections) {
      const cursor = collections.cursor as { firstBatch: Array<{ name: string }> };
      for (const collection of cursor.firstBatch) {
        console.info(`   Dropping collection: ${collection.name}`);
        await prisma.$runCommandRaw({
          drop: collection.name,
        });
      }
    }

    console.info('✅ Database dropped successfully.');
  }

  await createPrimaryAdminUser();

  // Get the admin user for notifications
  const adminUser = await prisma.user.findFirst({
    where: { role: 'admin' },
  });

  if (isProduction) {
    console.info('ℹ️ Production environment detected. Seeding as necessary.');

    console.info('✅ Production database seeded.');
  } else {
    console.info('🌱 Seeding development database...');

    // Create base entities first (these can be created in parallel)
    await Promise.all([createArtists(10), createGroups(5), createReleases(10), createTracks(50)]);

    // Link tracks to releases
    await createReleasesWithTracks();

    // Create featured artists after base entities exist
    await createFeaturedArtists(7);

    // Create notification banners (requires admin user)
    if (adminUser) {
      await createNotifications(adminUser.id);
    } else {
      console.warn('⚠️ No admin user found. Skipping notification creation.');
    }

    console.info('✅ Development database seeded.');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
