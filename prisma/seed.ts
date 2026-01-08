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

// const _createGroups = async (count: number) => {
//   const images = await prisma.image.createMany({
//     data: [
//       {
//         src: faker.image.urlLoremFlickr({ category: 'people' }),
//         altText: faker.lorem.sentence(),
//       },
//     ],
//   });

//   const groupData = Array.from({ length: count }).map(() => ({
//     name: faker.music.artist(),
//     shortBio: faker.lorem.sentence(),
//     bio: faker.lorem.paragraph(),
//     images,
//     formedOn: faker.date.past({ years: 10 }),
//     endedOn: faker.date.recent({ days: 1000 }),
//   }));

//   await prisma.group.createMany({
//     data: groupData,
//   });
// };

// const _createFeaturedArtists = async (count: number) => {
//   console.warn(
//     '⚠️ Creating featured artists requires existing artists, tracks, releases, and groups.'
//   );
//   const artists = await prisma.artist.findMany();
//   const tracks = await prisma.track.findMany();
//   const releases = await prisma.release.findMany();
//   const groups = await prisma.group.findMany();

//   if (artists.length === 0) {
//     console.warn('⚠️ No artists found. Skipping featured artists creation.');
//     return;
//   }

//   const featuredArtistData = Array.from({ length: count }).map(() => ({
//     featuredOn: faker.date.past({ years: 5 }),
//     artistId: faker.helpers.arrayElement(artists).id,
//     trackId: faker.helpers.arrayElement(tracks).id,
//     releaseId: faker.helpers.arrayElement(releases).id,
//     groupId: faker.helpers.arrayElement(groups).id,
//   }));

//   await prisma.featuredArtist.createMany({
//     data: featuredArtistData,
//   });
// };

// const _createReleases = async (count: number) => {
//   const releaseData = Array.from({ length: count }).map(() => ({
//     title: faker.music.album(),
//     description: faker.lorem.sentences(2),
//     releasedOn: faker.date.past({ years: 3 }),
//     coverArt: faker.image.urlLoremFlickr({ category: 'music' }),
//   }));

//   await prisma.release.createMany({
//     data: releaseData,
//   });
// };

// const _createTracks = async (count: number) => {
//   const trackData = Array.from({ length: count }).map(() => ({
//     title: faker.music.songName(),
//     coverArt: faker.image.urlLoremFlickr({ category: 'music' }),
//     duration: faker.number.int({ min: 120, max: 420 }), // Duration in seconds
//     audioUrl: faker.internet.url(),
//     position: faker.number.int({ min: 0, max: 10 }),
//   }));

//   await prisma.track.createMany({
//     data: trackData,
//   });
// };

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

    await Promise.all([
      // Create dummy data using faker data
      createArtists(10),
      // createGroups(10),
      // createReleases(20),
      // createTracks(50),
      // createFeaturedArtists(5),
    ]);

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
