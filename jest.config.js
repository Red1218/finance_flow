/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Integration tests hit the real (approved) Supabase project over the
  // network and are run separately via `npm run test:integration` — see
  // jest.integration.config.js. Everything else here is a pure/mocked unit
  // test with no network access.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/android/', '\\.integration\\.test\\.'],
  // @react-native-async-storage/async-storage has no meaning outside a real
  // device and ships its own official Jest mock for exactly this — used by
  // supabaseClient.ts's persistSession config. Not a network/behavior mock.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
};
