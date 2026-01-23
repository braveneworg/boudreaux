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

const createTracks = async (count: number) => {
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

const createFeaturedArtists = async (count: number) => {
  const artists = await prisma.artist.findMany();
  const tracks = await prisma.track.findMany();
  const releases = await prisma.release.findMany();
  const groups = await prisma.group.findMany();

  if (artists.length === 0) {
    console.warn('⚠️ No artists found. Skipping featured artists creation.');
    return;
  }

  // Create featured artists one at a time to handle the Artist[] relation
  for (let i = 0; i < count; i++) {
    const randomArtist = faker.helpers.arrayElement(artists);
    const randomTrack = tracks.length > 0 ? faker.helpers.arrayElement(tracks) : null;
    const randomRelease = releases.length > 0 ? faker.helpers.arrayElement(releases) : null;
    const randomGroup = groups.length > 0 ? faker.helpers.arrayElement(groups) : null;

    await prisma.featuredArtist.create({
      data: {
        displayName: faker.helpers.maybe(() => faker.person.fullName(), { probability: 0.3 }),
        featuredOn: faker.date.recent({ days: 30 }),
        position: i + 1,
        description: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.7 }),
        coverArt: faker.image.urlPicsumPhotos({ width: 400, height: 400 }),
        ...(randomTrack && { track: { connect: { id: randomTrack.id } } }),
        ...(randomRelease && { release: { connect: { id: randomRelease.id } } }),
        ...(randomGroup && { group: { connect: { id: randomGroup.id } } }),
        artists: {
          connect: [{ id: randomArtist.id }],
        },
      },
    });
  }

  console.info(`✅ Created ${count} featured artists.`);
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

  if (isProduction) {
    console.info('ℹ️ Production environment detected. Seeding as necessary.');

    console.info('✅ Production database seeded.');
  } else {
    console.info('🌱 Seeding development database...');

    // Create base entities first (these can be created in parallel)
    await Promise.all([createArtists(10), createGroups(5), createReleases(10), createTracks(20)]);

    // Create featured artists after base entities exist
    await createFeaturedArtists(7);

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
