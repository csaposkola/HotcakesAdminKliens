// File: tests/jest.config.js
module.exports = {
    testEnvironment: 'node',
    testTimeout: 60000,
    verbose: true,
    rootDir: '..', //  <--- CHANGE: Point rootDir to the project root (VS directory)
    testMatch: ['<rootDir>/tests/**/*.test.js'], // This will now correctly resolve to VS/tests/*.test.js
};