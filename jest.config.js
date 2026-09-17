/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/e2e/',
    '<rootDir>/scripts/__tests__/',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', rootDir: './' } }],
  },
};
