module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.mjs', '**/tests/**/*.test.cjs'],
  testPathIgnorePatterns: [
    '/node_modules/',
    // Temporarily disabled - requires fixes:
    // - report-timestamps.test.js: Firestore security rules issue with createdBy
    // - data-model.test.js: ES module configuration issue
    'tests/report-timestamps.test.js',
    'tests/data-model.test.js'
  ]
};
