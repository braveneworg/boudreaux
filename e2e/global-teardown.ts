export default async function globalTeardown() {
  // Cleanup is handled by Docker teardown: `npm run e2e:docker:down`
  // In CI, the MongoDB service container is destroyed automatically.
  console.info('Global teardown complete.');
}
