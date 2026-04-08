import { Platform, PrismaClient } from '@prisma/client';

import { UserService } from '@/lib/services/user-service';

import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const createAdminUsers = async () => {
  const adminFirstName = process.env.ADMIN_FIRST_NAME;
  const adminLastName = process.env.ADMIN_LAST_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPhone = process.env.ADMIN_PHONE;
  const secondaryFirstName = process.env.SECONDARY_ADMIN_FIRST_NAME;
  const secondaryLastName = process.env.SECONDARY_ADMIN_LAST_NAME;
  const secondaryEmail = process.env.SECONDARY_ADMIN_EMAIL;
  const secondaryPhone = process.env.SECONDARY_ADMIN_PHONE;
  const tertiaryFirstName = process.env.TERTIARY_ADMIN_FIRST_NAME;
  const tertiaryLastName = process.env.TERTIARY_ADMIN_LAST_NAME;
  const tertiaryEmail = process.env.TERTIARY_ADMIN_EMAIL;
  const tertiaryPhone = process.env.TERTIARY_ADMIN_PHONE;

  if (!adminFirstName || !adminLastName || !adminEmail || !adminPhone) {
    console.error(
      '❌ Check that the following environment variables are set: ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, ADMIN_PHONE'
    );
    process.exit(1);
  }

  if (!secondaryFirstName || !secondaryLastName || !secondaryEmail || !secondaryPhone) {
    console.error(
      '❌ Check that the following environment variables are set: SECONDARY_ADMIN_FIRST_NAME, SECONDARY_ADMIN_LAST_NAME, SECONDARY_ADMIN_EMAIL, SECONDARY_ADMIN_PHONE'
    );
    process.exit(1);
  }

  if (!tertiaryFirstName || !tertiaryLastName || !tertiaryEmail || !tertiaryPhone) {
    console.error(
      '❌ Check that the following environment variables are set: TERTIARY_ADMIN_FIRST_NAME, TERTIARY_ADMIN_LAST_NAME, TERTIARY_ADMIN_EMAIL, TERTIARY_ADMIN_PHONE'
    );
    process.exit(1);
  }

  await UserService.ensureAdminUser({
    firstName: adminFirstName,
    lastName: adminLastName,
    email: adminEmail,
    phone: adminPhone,
    role: 'admin',
  });

  await UserService.ensureAdminUser({
    firstName: secondaryFirstName,
    lastName: secondaryLastName,
    email: secondaryEmail,
    phone: secondaryPhone,
    role: 'admin',
  });

  await UserService.ensureAdminUser({
    firstName: tertiaryFirstName,
    lastName: tertiaryLastName,
    email: tertiaryEmail,
    phone: tertiaryPhone,
    role: 'admin',
  });
};

const createDefaultArtists = async () => {
  // Delete existing artists and their related URLs first
  await prisma.url.deleteMany({ where: { artistId: { not: undefined } } });
  await prisma.artist.deleteMany({});

  // Define artist data with URLs stored separately for later creation
  const artistsWithUrls = [
    {
      artist: {
        akaNames: 'Ceschi',
        firstName: 'Julio',
        middleName: 'Francisco',
        surname: 'Ramos',
        slug: 'julio-francisco-ramos-aka-ceschi',
        displayName: 'Ceschi',
        email: 'update-this-email-address@example.com',
        // TODO: strip telephone formatting leaving +country code and phone number numbers only
        phone: '+1234567890',
        bio: `
        Ceschi Ramos (the name is pronounced like "chess-key") crafts a
        distinctive blend of progressive hip-hop infused with folk and
        indie rock influences. While he possesses nearly mathematical
        precision in his technical rapping abilities, his core identity
        is that of a singer-songwriter. His catalog reflects this duality—one
        track might feature rapid-fire, punk-driven verses delivered at
        blistering speed, while the next could be a stripped-down folk ballad
        accompanied only by acoustic guitar.
      `,
        publishedOn: new Date(),
      },
      urls: [
        { platform: Platform.PATREON, url: 'https://www.patreon.com/ceschi' },
        { platform: Platform.BANDCAMP, url: 'https://ceschi.bandcamp.com' },
        { platform: Platform.WEBSITE, url: 'https://ceschiramos.com' },
        { platform: Platform.WEBSITE, url: 'https://linktr.ee/ceschi' },
      ],
    },
    {
      artist: {
        firstName: 'Myles',
        middleName: '',
        surname: 'Bullen',
        akaNames: 'beatboxpoet',
        slug: 'myles-bullen',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        Myles Bullen (they/he) is an Indigenous genre-fluid artist,
        ukulele-playing rapper, and spoken-word poet based in Portland, Maine.
        Often described as a "soft rap art poet," Bullen creates music that
        defies easy categorization, weaving together elements of hip-hop,
        folk punk, indie rock, spoken word, and emo rap into something wholly
        their own.
      `,
        publishedOn: new Date(),
      },
      urls: [
        { platform: Platform.BANDCAMP, url: 'https://mylesbullen.bandcamp.com/community' },
        { platform: Platform.WEBSITE, url: 'https://mylesbullen.com' },
        { platform: Platform.INSTAGRAM, url: 'https://instagram.com/beatboxpoet' },
      ],
    },
    {
      artist: {
        firstName: 'Gregory',
        middleName: '',
        surname: 'Pepper',
        slug: 'gregory-pepper',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        Greggory Pepper is a Canadian singer, songwriter, and music producer
        known for his eclectic blend of indie pop, folk, and electronic music.
        Based in Toronto, Pepper has released several albums and EPs that showcase
        his knack for crafting catchy melodies and introspective lyrics. His music often features
        lush arrangements and a mix of acoustic and electronic instrumentation,
        creating a sound that is both modern and timeless. Pepper has collaborated
        with various artists and producers, further expanding his musical horizons
        and experimenting with different styles and genres. With a dedicated fanbase
        and critical acclaim, Greggory Pepper continues to make a significant impact.
      `,
        publishedOn: new Date(),
      },
      urls: [
        { platform: Platform.BANDCAMP, url: 'https://gregorypepper.bandcamp.com/' },
        { platform: Platform.WEBSITE, url: 'https://www.camppepper.com/' },
        { platform: Platform.INSTAGRAM, url: 'https://www.instagram.com/gregorypepper/?hl=en' },
      ],
    },
    {
      artist: {
        firstName: 'David',
        middleName: '',
        surname: 'Ramos',
        slug: 'david-ramos',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        David Ramos is an American multi-instrumentalist, producer, and
        co-founder of Fake Four Inc., the independent record label he
        established alongside his brother Ceschi in 2008 in New Haven,
        Connecticut. A remarkably versatile musician, David was recognized by
        Modern Drummer magazine as one of the top 10 progressive drummers
        (ranked just after Thomas Pridgen) while still a student at
        Wesleyan University.
      `,
        publishedOn: new Date(),
      },
      urls: [{ platform: Platform.BANDCAMP, url: 'https://davidramos.bandcamp.com/' }],
    },
    {
      artist: {
        firstName: 'Factor',
        middleName: '',
        surname: 'Chandelier',
        slug: 'factor-chandelier',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        20 years after the release of his first album, Factor Chandelier
        has created Time Invested II, a nostalgic and energetic compilation
        reminiscent of how his music career started. With the intent of
        creating something inspiring for a younger self, the producer
        collaborated with his heroes, long-time friends and contemporaries
        to create a work of 16 songs. Time Invested II features a mix of
        artists that include tour mates, frequent collaborators and friends
        with whom Factor Chandelier shares undeniable creative bonds.
        The release of the album aligns with his 40th birthday and somehow
        still feels like this might just be the beginning.
      `,
        publishedOn: new Date(),
      },
      urls: [
        { platform: Platform.WEBSITE, url: 'https://factorchandelier.com/' },
        { platform: Platform.BANDCAMP, url: 'https://factorchandelier.bandcamp.com/' },
        { platform: Platform.INSTAGRAM, url: 'https://www.instagram.com/factorchandelier/?hl=en' },
        {
          platform: Platform.PATREON,
          url: 'https://www.patreon.com/factorchandelier?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEAc3J0YwZhcHBfaWQMMjU2MjgxMDQwNTU4AAGnPQelGoEVGUDmGYNrjq7YjywmNSjdAlF89CxrBPLylVohYkxm8eFyhWNQPrM_aem_MhJV08208R2ZaV8B328M1w',
        },
        {
          platform: Platform.SPOTIFY,
          url: 'https://open.spotify.com/artist/68XL9b5CHwRP50KMcVGl33',
        },
      ],
    },
    {
      artist: {
        firstName: 'Nathan',
        surname: 'Conrad',
        akaNames: 'Spoken Nerd',
        slug: 'spoken-nerd',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        Spoken Nerd has built a reputation for crafting cleverly layered lyrics that strike the perfect balance of wit
        and self-awareness. Now, with his debut release on Fake Four Records, he's generating significant buzz in the
        underground hip-hop community. Creative imagery and explorations of the human condition have long been hallmarks
        of Spoken Nerd's work, but this latest studio effort breaks new ground with jazz-infused instrumentation and
        notable guest appearances from Blueprint and Manchild. Producer Ryan Griffin shaped the sonic landscape for the
        album, translating Nerd's conceptual vision into a sound that should resonate with longtime supporters and
        newcomers alike. At the heart of the project is frontman Nathan Conrad—the kind of artist who feels like a
        trusted companion—and as he hits the road for his Fall tour, he's eager to connect with audiences
        ready to join him on the journey.
      `,
        publishedOn: new Date(),
      },
      urls: [
        {
          platform: Platform.BANDCAMP,
          url: 'https://fakefour.bandcamp.com/album/i-need-a-friend-like-you',
        },
      ],
    },
    {
      artist: {
        firstName: 'Scotty',
        surname: 'Trimble',
        akaNames: 'Sixo',
        slug: 'sixo',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        Scotty Trimble, who traded a career as a professional motocross racer
        for life as an indie rap producer under the name Sixo, has long
        grappled with philosophical questions about human agency.
        He's drawn to the idea that every event carries a certain probability
        of occurring, which raises uncomfortable questions: If we're operating
        within a finite set of variables, can we truly claim ownership over our
        decisions? Is the sense that we're directing our own lives nothing more
        than an elaborate illusion? These existential preoccupations, combined
        with a deep love of psychedelic rock from the 1960s and '70s, drove
        Sixo into his home studio to create The Odds of Free Will, his third
        and final full-length album. R.I.P Sixo.
      `,
        publishedOn: new Date(),
      },
      urls: [
        {
          platform: Platform.BANDCAMP,
          url: 'https://fakefour.bandcamp.com/album/the-odds-of-free-will',
        },
      ],
    },
    {
      artist: {
        firstName: 'Onry',
        surname: 'Ozzborn',
        slug: 'onry-ozzborn',
        email: 'update-this-email-address@example.com',
        phone: '+1234567890',
        bio: `
        Onry Ozzborn, born Onry Lorenz Ozzborn, is an American rapper and producer
          from Seattle, Washington. He is a founding member of the hip-hop group
          Dark Time Sunshine alongside Zavala, and has been associated with the
          underground hip-hop collective Oldominion. Known for his introspective
          and often dark lyrical content, Ozzborn has released numerous solo albums
          and collaborative projects throughout his career, establishing himself
          as a significant figure in the Pacific Northwest underground hip-hop scene.
      `,
        publishedOn: new Date(),
      },
      urls: [{ platform: Platform.WEBSITE, url: 'https://en.wikipedia.org/wiki/Onry_Ozzborn' }],
    },
  ];

  // Create artists first (without URLs since it's a relation)
  const artistData = artistsWithUrls.map(({ artist }) => artist);
  await prisma.artist.createMany({
    data: artistData as Prisma.ArtistCreateManyInput[],
  });

  // Now create URLs linked to artists by slug
  for (const { artist, urls } of artistsWithUrls) {
    const createdArtist = await prisma.artist.findUnique({
      where: { slug: artist.slug },
    });

    if (createdArtist && urls.length > 0) {
      await prisma.url.createMany({
        data: urls.map((urlData) => ({
          ...urlData,
          artistId: createdArtist.id,
        })),
      });
    }
  }

  console.info('✅ Created default artists with URLs.');
};

/**
 * Create banner notification slots with various configurations
 * BannerNotification uses slotNumber (1-5) for carousel positioning
 * Dates are set dynamically relative to current time so they display when seeded
 */
const createNotifications = async (adminUserId: string) => {
  // Delete existing banner notifications first (so we get fresh dates on re-seed)
  await prisma.bannerNotification.deleteMany({});

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const bannerNotifications = [
    {
      slotNumber: 1,
      content: 'Welcome to <b>Brave New Org</b> — Discover new music from independent artists',
      textColor: '#ffffff',
      backgroundColor: '#16213e',
      displayFrom: now,
      displayUntil: thirtyDaysLater,
    },
    {
      slotNumber: 2,
      content: 'New Release Available — Check out our latest album',
      textColor: '#ffd700',
      backgroundColor: '#533483',
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
    {
      slotNumber: 3,
      content: 'Live Show This Weekend — Join us for an unforgettable night',
      textColor: '#ff6b6b',
      backgroundColor: '#000000',
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      slotNumber: 4,
      content: 'Subscribe to Our Newsletter — Stay updated with the latest releases',
      textColor: '#ffffff',
      backgroundColor: '#e94560',
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    },
    {
      slotNumber: 5,
      content: 'Limited Edition Vinyl — Get yours before they are gone!',
      textColor: '#ffeb3b',
      backgroundColor: '#1a1a2e',
      displayFrom: now,
      displayUntil: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const banner of bannerNotifications) {
    await prisma.bannerNotification.create({
      data: {
        ...banner,
        addedBy: { connect: { id: adminUserId } },
      },
    });
  }

  console.info(`✅ Created ${bannerNotifications.length} banner notifications.`);
};

/**
 * Create sample digital formats for development testing (Feature 004-release-digital-formats)
 * Adds digital formats to the first available release in the database
 */
const createSampleDigitalFormats = async () => {
  console.info('🎵 Creating sample digital formats...');

  // Find the first release to attach formats to
  const sampleRelease = await prisma.release.findFirst();

  if (!sampleRelease) {
    console.warn(
      '⚠️ No releases found in database. Skipping digital format seeding. Create releases first.'
    );
    return;
  }

  console.info(`   Adding digital formats to release: ${sampleRelease.title}`);

  // Define sample digital formats (simulating uploaded files)
  // In production, s3Key would point to actual S3 objects
  const digitalFormats: Prisma.ReleaseDigitalFormatCreateInput[] = [
    {
      release: { connect: { id: sampleRelease.id } },
      formatType: 'MP3_320KBPS',
      s3Key: `releases/${sampleRelease.id}/digital-formats/MP3_320KBPS/sample-${Date.now()}.mp3`,
      fileName: `${sampleRelease.title} - MP3 320kbps.mp3`,
      fileSize: BigInt(45000000), // 45MB (typical album-length MP3 at 320kbps)
      mimeType: 'audio/mpeg',
      uploadedAt: new Date(),
    },
    {
      release: { connect: { id: sampleRelease.id } },
      formatType: 'FLAC',
      s3Key: `releases/${sampleRelease.id}/digital-formats/FLAC/sample-${Date.now()}.flac`,
      fileName: `${sampleRelease.title} - FLAC.flac`,
      fileSize: BigInt(180000000), // 180MB (typical album-length FLAC)
      mimeType: 'audio/flac',
      uploadedAt: new Date(),
    },
    {
      release: { connect: { id: sampleRelease.id } },
      formatType: 'WAV',
      s3Key: `releases/${sampleRelease.id}/digital-formats/WAV/sample-${Date.now()}.wav`,
      fileName: `${sampleRelease.title} - WAV.wav`,
      fileSize: BigInt(420000000), // 420MB (typical album-length WAV uncompressed)
      mimeType: 'audio/wav',
      uploadedAt: new Date(),
    },
    {
      release: { connect: { id: sampleRelease.id } },
      formatType: 'AAC',
      s3Key: `releases/${sampleRelease.id}/digital-formats/AAC/sample-${Date.now()}.aac`,
      fileName: `${sampleRelease.title} - AAC.aac`,
      fileSize: BigInt(38000000), // 38MB (typical album-length AAC)
      mimeType: 'audio/aac',
      uploadedAt: new Date(),
    },
  ];

  // Create digital formats (upsert to avoid duplicates on re-seeding)
  for (const formatData of digitalFormats) {
    await prisma.releaseDigitalFormat.upsert({
      where: {
        releaseId_formatType: {
          releaseId: sampleRelease.id,
          formatType: formatData.formatType,
        },
      },
      update: {
        fileName: formatData.fileName,
        fileSize: formatData.fileSize,
        s3Key: formatData.s3Key,
      },
      create: formatData,
    });

    console.info(`   ✓ Created ${formatData.formatType} format`);
  }

  console.info('✅ Sample digital formats created successfully.');
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

  await createAdminUsers();

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
    await createDefaultArtists();

    // Link tracks to releases
    // await createReleasesWithTracks();

    // Create featured artists after base entities exist
    // await createFeaturedArtists(7);

    // Create notification banners (requires admin user)
    if (adminUser) {
      await createNotifications(adminUser.id);
    } else {
      console.warn('⚠️ No admin user found. Skipping notification creation.');
    }

    // Create sample digital formats for releases (Feature 004-release-digital-formats)
    await createSampleDigitalFormats();

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
