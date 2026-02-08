import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.info('Testing the same query that fails in track-service...');

  try {
    const tracks = await prisma.track.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        releaseTracks: {
          include: {
            release: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        artists: {
          include: {
            artist: {
              select: {
                id: true,
                firstName: true,
                surname: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    console.info('Success! Found', tracks.length, 'tracks');
    for (const track of tracks) {
      console.info('Track:', track.id, track.title);
      console.info(
        '  Artists:',
        track.artists.map((a) => a.artist?.displayName || 'NULL')
      );
    }
  } catch (error) {
    console.error('Query failed:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
