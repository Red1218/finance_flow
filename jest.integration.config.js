/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Only *.integration.test.ts — real network calls against the approved
  // Supabase project (drkalfmlrfhohwznsenl). Not run by `npm test`. Each run
  // signs in a fresh anonymous user (no other way to get an authenticated,
  // RLS-respecting session with only the public anon key) and cleans up the
  // data rows it creates, but the auth user itself cannot be self-deleted —
  // see the repository's integration test file for details.
  testMatch: ['**/*.integration.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/android/'],
  testTimeout: 20000,
  setupFiles: ['<rootDir>/jest.integration.setup.js'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
};
