// Test stub for the `server-only` package (aliased in vitest.config.ts).
// The real package has no runtime export; it exists only to make Next.js fail
// the build if a server module is imported into a client bundle. In unit tests
// there is no such boundary, so this is an empty no-op module.
export {};
