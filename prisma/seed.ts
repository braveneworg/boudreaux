import { faker } from '@faker-js/faker';
import { Platform, PrismaClient } from '@prisma/client';

import { UserService } from '@/lib/services/user-service';

import type { Prisma } from '@prisma/client';

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
    await Promise.all([
      createDefaultArtists(),
      createGroups(5),
      createReleases(10),
      createTracks(50),
    ]);

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
