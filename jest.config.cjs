module.exports = {
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }] },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
};
