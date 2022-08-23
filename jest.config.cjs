/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^src/tests/.+ts$': 'ts-jest',
    "^.+\\.js$": "ts-jest",
  },
  transformIgnorePatterns: [
    
  ],
};